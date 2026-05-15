import {
	getCascadeChildren,
	getModelAccessor,
	modelIsSoftDeletable,
} from "./soft-delete.dmmf";
import {
	DELETED_AT,
	DELETED_BY,
	DELETED_BY_CASCADE,
	type PrismaLikeClient,
	type RestoreArgs,
	type SoftDeleteArgs,
} from "./soft-delete.types";

interface DynamicModel {
	findMany: (args: unknown) => Promise<Array<{ id: string }>>;
	updateMany: (args: unknown) => Promise<{ count: number }>;
}

/**
 * Erase the client's strict per-model types so we can index by a
 * runtime-derived string. The DMMF walker guarantees the model exists;
 * we cast at this single chokepoint instead of sprinkling casts
 * throughout the cascade logic.
 */
function modelOn(client: PrismaLikeClient, accessor: string): DynamicModel {
	return (client as unknown as Record<string, DynamicModel>)[accessor];
}

/**
 * Soft-delete utilities.
 *
 * These are standalone functions (not extension methods) so callers can
 * pass a transaction client explicitly. Pair them with `$transaction` when
 * cascade atomicity matters.
 *
 * Cascade discovery is driven by `@relation(onDelete: Cascade)` on the
 * child side — see [soft-delete.dmmf.ts](./soft-delete.dmmf.ts). The
 * `deletedByCascade` flag on each row records whether the row was
 * soft-deleted as part of a parent cascade, so restore can be symmetric
 * without resurrecting rows that were independently deleted.
 */

interface CascadeContext {
	deletedAt: Date;
	actorId: string | null;
	visited: Set<string>;
}

async function cascadeSoftDeleteInto(
	client: PrismaLikeClient,
	parentModel: string,
	parentId: string,
	ctx: CascadeContext,
): Promise<void> {
	const visitKey = `${parentModel}:${parentId}`;
	if (ctx.visited.has(visitKey)) {
		return;
	}
	ctx.visited.add(visitKey);

	const children = getCascadeChildren(parentModel);
	if (children.length === 0) {
		return;
	}

	await Promise.all(
		children.map(async ({ childModel, foreignKey }) => {
			const accessor = getModelAccessor(childModel);

			const model = modelOn(client, accessor);
			const rows = await model.findMany({
				where: { [foreignKey]: parentId, [DELETED_AT]: null },
				select: { id: true },
			});

			if (rows.length === 0) {
				return;
			}

			const ids = rows.map((r) => r.id);
			await model.updateMany({
				where: { id: { in: ids }, [DELETED_AT]: null },
				data: {
					[DELETED_AT]: ctx.deletedAt,
					[DELETED_BY]: ctx.actorId,
					[DELETED_BY_CASCADE]: true,
				},
			});

			await Promise.all(
				ids.map((id) => cascadeSoftDeleteInto(client, childModel, id, ctx)),
			);
		}),
	);
}

/**
 * Soft-delete one or more rows of `modelName` matching `where`, then
 * cascade into every child relation declared with `onDelete: Cascade`.
 *
 * Cascaded children are stamped with `deletedByCascade = true`. Rows
 * already in the tombstone set are not touched again.
 *
 * Pass a `tx` client when called inside `$transaction` so the whole
 * cascade is atomic; pass the root client for stand-alone use.
 */
export async function softDelete(
	client: PrismaLikeClient,
	modelName: string,
	args: SoftDeleteArgs,
): Promise<{ ids: string[] }> {
	if (!modelIsSoftDeletable(modelName)) {
		throw new Error(
			`softDelete called on non-soft-deletable model "${modelName}"`,
		);
	}

	const accessor = getModelAccessor(modelName);
	const deletedAt = new Date();
	const actorId = args.actorId ?? null;
	const model = modelOn(client, accessor);

	const targets = await model.findMany({
		where: { ...args.where, [DELETED_AT]: null },
		select: { id: true },
	});

	if (targets.length === 0) {
		return { ids: [] };
	}

	const ids = targets.map((t) => t.id);
	await model.updateMany({
		where: { id: { in: ids }, [DELETED_AT]: null },
		data: {
			[DELETED_AT]: deletedAt,
			[DELETED_BY]: actorId,
			[DELETED_BY_CASCADE]: false,
		},
	});

	const ctx: CascadeContext = { deletedAt, actorId, visited: new Set() };
	await Promise.all(
		ids.map((id) => cascadeSoftDeleteInto(client, modelName, id, ctx)),
	);

	return { ids };
}

interface RestoreContext {
	visited: Set<string>;
}

async function cascadeRestoreInto(
	client: PrismaLikeClient,
	parentModel: string,
	parentId: string,
	ctx: RestoreContext,
): Promise<void> {
	const visitKey = `${parentModel}:${parentId}`;
	if (ctx.visited.has(visitKey)) {
		return;
	}
	ctx.visited.add(visitKey);

	const children = getCascadeChildren(parentModel);
	if (children.length === 0) {
		return;
	}

	await Promise.all(
		children.map(async ({ childModel, foreignKey }) => {
			const accessor = getModelAccessor(childModel);

			const model = modelOn(client, accessor);
			const rows = await model.findMany({
				where: {
					[foreignKey]: parentId,
					[DELETED_AT]: { not: null },
					[DELETED_BY_CASCADE]: true,
				},
				select: { id: true },
			});

			if (rows.length === 0) {
				return;
			}

			const ids = rows.map((r) => r.id);
			await model.updateMany({
				where: {
					id: { in: ids },
					[DELETED_AT]: { not: null },
					[DELETED_BY_CASCADE]: true,
				},
				data: {
					[DELETED_AT]: null,
					[DELETED_BY]: null,
					[DELETED_BY_CASCADE]: false,
				},
			});

			await Promise.all(
				ids.map((id) => cascadeRestoreInto(client, childModel, id, ctx)),
			);
		}),
	);
}

/**
 * Restore one or more soft-deleted rows of `modelName` matching `where`,
 * then symmetrically restore every cascaded descendant (rows where
 * `deletedByCascade = true`).
 *
 * Independently-deleted descendants (`deletedByCascade = false`) are
 * preserved — restoring a parent does not undo unrelated tombstones.
 */
export async function restore(
	client: PrismaLikeClient,
	modelName: string,
	args: RestoreArgs,
): Promise<{ ids: string[] }> {
	if (!modelIsSoftDeletable(modelName)) {
		throw new Error(
			`restore called on non-soft-deletable model "${modelName}"`,
		);
	}

	const accessor = getModelAccessor(modelName);
	const model = modelOn(client, accessor);

	const targets = await model.findMany({
		where: { ...args.where, [DELETED_AT]: { not: null } },
		select: { id: true },
	});

	if (targets.length === 0) {
		return { ids: [] };
	}

	const ids = targets.map((t) => t.id);
	await model.updateMany({
		where: { id: { in: ids }, [DELETED_AT]: { not: null } },
		data: {
			[DELETED_AT]: null,
			[DELETED_BY]: null,
			[DELETED_BY_CASCADE]: false,
		},
	});

	const ctx: RestoreContext = { visited: new Set() };
	await Promise.all(
		ids.map((id) => cascadeRestoreInto(client, modelName, id, ctx)),
	);

	return { ids };
}
