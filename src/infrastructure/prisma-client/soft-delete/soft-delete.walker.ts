import type { RelationField } from "./soft-delete.dmmf";
import {
	findRelation,
	getRelations,
	modelExists,
	modelIsSoftDeletable,
} from "./soft-delete.dmmf";
import { DELETED_AT } from "./soft-delete.types";

/**
 * Single recursive walker shared by:
 *
 *   - The Prisma extension (mode = "filter"): injects `deletedAt: null`
 *     into every where clause that targets a soft-deletable model.
 *   - The `withDeleted` helper (mode = "bypass"): injects `deletedAt:
 *     undefined` into the same places. The extension treats *any*
 *     presence of `deletedAt` as the caller opting out, so the bypass
 *     pre-seeds the escape hatch through the whole tree.
 *
 * Walked surfaces:
 *   - top-level `where`
 *   - relation predicates inside `where` (including AND/OR/NOT trees and
 *     the to-many `some`/`every`/`none` operators)
 *   - relation entries in `include`/`select` (recursive, at any depth)
 *   - `_count.select.<relation>` and the `_count: true` shorthand
 *
 * Prisma-imposed limit: required to-one includes use `XxxDefaultArgs`,
 * which has no `where` field. Filtering would require lying about
 * non-null. Such relations pass through, but the walker still recurses
 * into their nested include/select so deeper levels remain filterable.
 *
 * Scalar selections (`select: { id: true }`) are recognised by the
 * absence of a relation entry for that field name and pass through
 * unchanged.
 */

export type WalkerMode = "filter" | "bypass";

interface ArgsBag {
	where?: Record<string, unknown>;
	include?: Record<string, unknown>;
	select?: Record<string, unknown>;
}

/** Standard Prisma where-operator keys that hold sub-where predicates. */
const WHERE_LOGICAL_KEYS = new Set(["AND", "OR", "NOT"]);

/** to-many relation-filter keys; their value is a sub-where. */
const TO_MANY_FILTER_KEYS = new Set(["some", "every", "none"]);

function injectedValue(mode: WalkerMode): null | undefined {
	return mode === "filter" ? null : undefined;
}

function hasExplicitDeletedAtFilter(where: unknown): boolean {
	return typeof where === "object" && where !== null && DELETED_AT in where;
}

function mergeDeletedAt(
	mode: WalkerMode,
	where: Record<string, unknown> | undefined,
): Record<string, unknown> {
	// Any explicit `deletedAt` in the caller's `where` is the caller
	// opting out of the default behavior for that level — leave it alone.
	// This applies to BOTH modes:
	//   - filter mode: caller has an escape hatch (e.g. `deletedAt: undefined`
	//     to include tombstones), respect it.
	//   - bypass mode: caller has narrowed to a slice (e.g.
	//     `deletedAt: { not: null }` for tombstones only); overwriting
	//     with `undefined` would silently widen the query back to "all".
	//     That was the source of "Deleted" returning the same rows as
	//     "All" in list endpoints.
	if (where && hasExplicitDeletedAtFilter(where)) {
		return where;
	}
	return { ...(where ?? {}), [DELETED_AT]: injectedValue(mode) };
}

function processWhere(
	mode: WalkerMode,
	modelName: string,
	where: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
	if (!where) {
		return where;
	}

	const out: Record<string, unknown> = { ...where };

	for (const [key, value] of Object.entries(out)) {
		if (WHERE_LOGICAL_KEYS.has(key)) {
			if (Array.isArray(value)) {
				out[key] = value.map((entry) =>
					processWhere(mode, modelName, entry as Record<string, unknown>),
				);
			} else if (value && typeof value === "object") {
				out[key] = processWhere(
					mode,
					modelName,
					value as Record<string, unknown>,
				);
			}
			continue;
		}

		const relation = findRelation(modelName, key);
		if (!relation) {
			continue;
		}
		if (!modelIsSoftDeletable(relation.targetModel)) {
			continue;
		}
		if (value === null || typeof value !== "object") {
			continue;
		}

		if (relation.cardinality === "toMany") {
			const predicate = value as Record<string, unknown>;
			const next: Record<string, unknown> = { ...predicate };
			for (const filterKey of TO_MANY_FILTER_KEYS) {
				if (filterKey in next) {
					const inner = next[filterKey] as Record<string, unknown> | undefined;
					next[filterKey] = mergeDeletedAt(
						mode,
						processWhere(mode, relation.targetModel, inner),
					);
				}
			}
			out[key] = next;
		} else {
			out[key] = mergeDeletedAt(
				mode,
				processWhere(
					mode,
					relation.targetModel,
					value as Record<string, unknown>,
				),
			);
		}
	}

	return out;
}

function processRelationArg(
	mode: WalkerMode,
	relation: RelationField,
	value: unknown,
): unknown {
	if (relation.cardinality === "toOneRequired") {
		// Prisma's XxxDefaultArgs doesn't accept `where`. Pass through but
		// still recurse into nested include/select so descendants are
		// reached.
		if (value && typeof value === "object" && !Array.isArray(value)) {
			return processIncludeSelectArgs(
				mode,
				relation.targetModel,
				value as ArgsBag,
			);
		}
		return value;
	}

	if (value === true) {
		return { where: { [DELETED_AT]: injectedValue(mode) } };
	}
	if (value === false || value === null || value === undefined) {
		return value;
	}
	if (typeof value !== "object") {
		return value;
	}

	const bag = value as ArgsBag;
	const next: ArgsBag = processIncludeSelectArgs(
		mode,
		relation.targetModel,
		bag,
	);
	next.where = mergeDeletedAt(mode, next.where);
	return next;
}

function processCountArg(
	mode: WalkerMode,
	ownerModel: string,
	value: unknown,
): unknown {
	// `_count: true` shorthand — Prisma's `XxxCountOutputType` includes
	// only the to-many relations (to-one rows aren't "counted"). Expand
	// it here so every soft-deletable to-many count gets the filter,
	// otherwise the boolean form would silently bypass the default while
	// the object form would not. We don't expand non-soft-deletable
	// to-many relations either — they don't need filtering and the
	// expansion would change the result shape unnecessarily.
	if (value === true) {
		const softDeletableToMany = getRelations(ownerModel).filter(
			(r) => r.cardinality === "toMany" && modelIsSoftDeletable(r.targetModel),
		);
		if (softDeletableToMany.length === 0) {
			return value;
		}
		const allToMany = getRelations(ownerModel).filter(
			(r) => r.cardinality === "toMany",
		);
		const expanded: Record<string, unknown> = {};
		for (const rel of allToMany) {
			expanded[rel.fieldName] = modelIsSoftDeletable(rel.targetModel)
				? { where: { [DELETED_AT]: injectedValue(mode) } }
				: true;
		}
		return { select: expanded };
	}

	if (!value || typeof value !== "object") {
		return value;
	}
	const arg = value as { select?: Record<string, unknown> };
	if (!arg.select) {
		return value;
	}
	const next: Record<string, unknown> = { ...arg.select };

	for (const [key, raw] of Object.entries(next)) {
		const relation = findRelation(ownerModel, key);
		if (!relation) {
			continue;
		}
		if (!modelIsSoftDeletable(relation.targetModel)) {
			continue;
		}
		if (relation.cardinality === "toOneRequired") {
			continue;
		}

		if (raw === true) {
			next[key] = { where: { [DELETED_AT]: injectedValue(mode) } };
		} else if (raw && typeof raw === "object") {
			const bag = raw as { where?: Record<string, unknown> };
			next[key] = { ...bag, where: mergeDeletedAt(mode, bag.where) };
		}
	}

	return { ...arg, select: next };
}

function processIncludeSelectArgs(
	mode: WalkerMode,
	ownerModel: string,
	bag: ArgsBag,
): ArgsBag {
	const next: ArgsBag = { ...bag };

	if (next.where) {
		next.where = processWhere(mode, ownerModel, next.where);
	}

	for (const containerKey of ["include", "select"] as const) {
		const container = next[containerKey];
		if (!container) {
			continue;
		}

		const nextContainer: Record<string, unknown> = {};

		for (const [key, value] of Object.entries(container)) {
			if (key === "_count") {
				nextContainer[key] = processCountArg(mode, ownerModel, value);
				continue;
			}

			const relation = findRelation(ownerModel, key);
			if (!relation) {
				nextContainer[key] = value;
				continue;
			}

			if (!modelIsSoftDeletable(relation.targetModel)) {
				nextContainer[key] = value;
				continue;
			}

			nextContainer[key] = processRelationArg(mode, relation, value);
		}

		next[containerKey] = nextContainer;
	}

	return next;
}

function applyWalker<T>(mode: WalkerMode, modelName: string, args: T): T {
	if (!args || typeof args !== "object") {
		return args;
	}
	const bag = args as ArgsBag;
	const next: ArgsBag = processIncludeSelectArgs(mode, modelName, bag);

	if (modelIsSoftDeletable(modelName)) {
		next.where = mergeDeletedAt(mode, next.where);
	}

	return next as T;
}

/**
 * Filter-mode entry point used by the extension's query interceptors.
 * Injects `deletedAt: null` everywhere a soft-deletable model is
 * filterable; leaves caller-supplied `deletedAt` keys alone.
 */
export function applySoftDeleteFilters<T>(modelName: string, args: T): T {
	return applyWalker("filter", modelName, args);
}

/**
 * Bypass-mode entry point used by `withDeleted`. Throws on an unknown
 * model name so typos can't silently no-op.
 */
export function applySoftDeleteBypass<T>(modelName: string, args: T): T {
	if (!modelExists(modelName)) {
		throw new Error(
			`withDeleted called with unknown model "${modelName}". ` +
				`Expected one of the model names from your Prisma schema.`,
		);
	}
	return applyWalker("bypass", modelName, args);
}
