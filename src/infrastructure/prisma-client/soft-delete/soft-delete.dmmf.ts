import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { Prisma } from "@prisma/client";

import {
	type CascadeChild,
	DELETED_AT,
	DELETED_BY_CASCADE,
} from "./soft-delete.types";

/**
 * Soft-delete metadata derived from the Prisma schema at startup.
 *
 * - Cascade relations are identified by `@relation(onDelete: Cascade)` on
 *   the child side.
 * - Relation cardinality (to-many / optional-to-one / required-to-one)
 *   is recovered by parsing the schema files because Prisma 7's runtime
 *   DMMF strips both `relationOnDelete` and `isList`/`isRequired`.
 *
 * The parse runs ONCE at first use and is cached.
 *
 * A model qualifies as soft-deletable when it has both `deletedAt` and
 * `deletedByCascade` columns. Models missing either are passed through
 * by the extension (no auto-filter, no write block).
 */

export type RelationCardinality = "toMany" | "toOneOptional" | "toOneRequired";

export interface RelationField {
	fieldName: string;
	targetModel: string;
	cardinality: RelationCardinality;
}

interface SoftDeleteMetadata {
	knownModels: Set<string>;
	hasDeletedAt: Map<string, boolean>;
	cascadeChildren: Map<string, CascadeChild[]>;
	accessor: Map<string, string>;
	/** modelName -> fieldName -> relation. Map (not array) for O(1) lookup. */
	relations: Map<string, Map<string, RelationField>>;
}

let cached: SoftDeleteMetadata | null = null;

const SCHEMA_DIR_ENV = "SOFT_DELETE_SCHEMA_DIR";
const DEFAULT_SCHEMA_DIR = "prisma/schema";

function toAccessor(modelName: string): string {
	return modelName.charAt(0).toLowerCase() + modelName.slice(1);
}

function readSchemaFiles(): string {
	const dir = process.env[SCHEMA_DIR_ENV] ?? DEFAULT_SCHEMA_DIR;
	const files = readdirSync(dir).filter((f) => f.endsWith(".prisma"));
	return files.map((f) => readFileSync(join(dir, f), "utf8")).join("\n");
}

interface CascadeDeclaration {
	parentModel: string;
	childModel: string;
	foreignKey: string;
}

interface RelationDeclaration {
	ownerModel: string;
	fieldName: string;
	targetModel: string;
	cardinality: RelationCardinality;
}

/**
 * Walk the schema files once and pull out every cascade FK plus every
 * relation field with its cardinality. Single pass so both pieces of
 * metadata stay consistent.
 *
 * Conventions assumed (matched by everything in this repo):
 *   - `@relation(...)` declarations are single-line.
 *   - Type tokens are bare model names; `Foo[]` marks to-many; `Foo?`
 *     marks optional to-one; `Foo` marks required to-one.
 */
function parseSchemaDeclarations(combinedSchema: string): {
	cascades: CascadeDeclaration[];
	relations: RelationDeclaration[];
} {
	const cascades: CascadeDeclaration[] = [];
	const relations: RelationDeclaration[] = [];

	const modelRe = /\bmodel\s+(\w+)\s*\{([\s\S]*?)\}/g;
	let modelMatch: RegExpExecArray | null = modelRe.exec(combinedSchema);
	while (modelMatch !== null) {
		const ownerModel = modelMatch[1];
		const body = modelMatch[2];

		// Relation field: `<name>  <Type>[?]([])? [@relation(...)]?`
		// Filtered downstream against the DMMF model list so scalar fields
		// like `id String` don't slip through.
		const fieldRe =
			/^\s*(\w+)\s+([A-Z]\w*)(\[\])?(\?)?(?:\s+@relation\(([^)]*)\))?/gm;
		let fieldMatch: RegExpExecArray | null = fieldRe.exec(body);
		while (fieldMatch !== null) {
			const fieldName = fieldMatch[1];
			const targetModel = fieldMatch[2];
			const isList = fieldMatch[3] === "[]";
			const isOptional = fieldMatch[4] === "?";
			const relationArgs = fieldMatch[5];

			const cardinality: RelationCardinality = isList
				? "toMany"
				: isOptional
					? "toOneOptional"
					: "toOneRequired";

			relations.push({
				ownerModel,
				fieldName,
				targetModel,
				cardinality,
			});

			if (relationArgs && /onDelete:\s*Cascade/.test(relationArgs)) {
				const fkMatch = /fields:\s*\[([^\]]+)\]/.exec(relationArgs);
				if (fkMatch) {
					const fks = fkMatch[1]
						.split(",")
						.map((s) => s.trim())
						.filter(Boolean);
					for (const fk of fks) {
						cascades.push({
							parentModel: targetModel,
							childModel: ownerModel,
							foreignKey: fk,
						});
					}
				}
			}

			fieldMatch = fieldRe.exec(body);
		}

		modelMatch = modelRe.exec(combinedSchema);
	}

	return { cascades, relations };
}

function buildMetadata(): SoftDeleteMetadata {
	const knownModels = new Set<string>();
	const hasDeletedAt = new Map<string, boolean>();
	const cascadeChildren = new Map<string, CascadeChild[]>();
	const accessor = new Map<string, string>();
	const relations = new Map<string, Map<string, RelationField>>();

	const models = Prisma.dmmf.datamodel.models;

	for (const model of models) {
		knownModels.add(model.name);
		const fieldNames = new Set(model.fields.map((f) => f.name));
		const qualifies =
			fieldNames.has(DELETED_AT) && fieldNames.has(DELETED_BY_CASCADE);
		hasDeletedAt.set(model.name, qualifies);
		accessor.set(model.name, toAccessor(model.name));
		cascadeChildren.set(model.name, []);
		relations.set(model.name, new Map());
	}

	const { cascades, relations: relationDecls } = parseSchemaDeclarations(
		readSchemaFiles(),
	);

	for (const decl of relationDecls) {
		if (!knownModels.has(decl.targetModel)) {
			continue; // scalar/enum that survived the regex
		}
		relations.get(decl.ownerModel)?.set(decl.fieldName, {
			fieldName: decl.fieldName,
			targetModel: decl.targetModel,
			cardinality: decl.cardinality,
		});
	}

	for (const c of cascades) {
		if (!hasDeletedAt.get(c.childModel)) {
			continue;
		}
		if (!cascadeChildren.has(c.parentModel)) {
			continue;
		}
		cascadeChildren
			.get(c.parentModel)
			?.push({ childModel: c.childModel, foreignKey: c.foreignKey });
	}

	return {
		knownModels,
		hasDeletedAt,
		cascadeChildren,
		accessor,
		relations,
	};
}

function getMetadata(): SoftDeleteMetadata {
	if (!cached) {
		cached = buildMetadata();
	}
	return cached;
}

export function modelExists(modelName: string): boolean {
	return getMetadata().knownModels.has(modelName);
}

export function modelIsSoftDeletable(modelName: string): boolean {
	return getMetadata().hasDeletedAt.get(modelName) ?? false;
}

export function getCascadeChildren(modelName: string): CascadeChild[] {
	return getMetadata().cascadeChildren.get(modelName) ?? [];
}

export function getModelAccessor(modelName: string): string {
	return getMetadata().accessor.get(modelName) ?? toAccessor(modelName);
}

export function getRelations(modelName: string): RelationField[] {
	const m = getMetadata().relations.get(modelName);
	return m ? Array.from(m.values()) : [];
}

export function findRelation(
	modelName: string,
	fieldName: string,
): RelationField | undefined {
	return getMetadata().relations.get(modelName)?.get(fieldName);
}
