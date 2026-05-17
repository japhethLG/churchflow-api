import {
	getCascadeChildren,
	getModelAccessor,
	modelIsSoftDeletable,
} from "./soft-delete.dmmf";
import {
	DELETED_AT,
	DELETED_BY_CASCADE,
	type PrismaLikeClient,
} from "./soft-delete.types";

/**
 * Per-child tombstone counts for an upcoming restore.
 *
 * Keys are the child model names declared in the .prisma schema
 * (e.g. `CampaignItem`). Values are the number of rows that would be
 * brought back when the named parent is restored (rows where
 * `deletedByCascade = true` and the FK matches).
 */
export type RestoreCascadeCounts = Record<string, number>;

interface DynamicModel {
	count: (args: unknown) => Promise<number>;
	findMany: (args: unknown) => Promise<Array<{ id: string }>>;
}

function modelOn(client: PrismaLikeClient, accessor: string): DynamicModel {
	return (client as unknown as Record<string, DynamicModel>)[accessor];
}

interface PreviewContext {
	counts: RestoreCascadeCounts;
	visited: Set<string>;
}

async function walk(
	client: PrismaLikeClient,
	parentModel: string,
	parentId: string,
	ctx: PreviewContext,
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

			const where = {
				[foreignKey]: parentId,
				[DELETED_AT]: { not: null },
				[DELETED_BY_CASCADE]: true,
			};

			// Counted via `count` to keep this cheap, then ids fetched to
			// recurse into grandchildren. Both queries opt into tombstones via
			// the explicit deletedAt filter.
			const [count, rows] = await Promise.all([
				model.count({ where }),
				model.findMany({ where, select: { id: true } }),
			]);

			// Skip zero-count entries — keeping them around forces the FE to
			// filter them out before rendering "Restoring will also restore 0
			// items", which is just noise.
			if (count > 0) {
				ctx.counts[childModel] = (ctx.counts[childModel] ?? 0) + count;
			}

			await Promise.all(rows.map((r) => walk(client, childModel, r.id, ctx)));
		}),
	);
}

/**
 * Count the tombstones that would be restored alongside `parentId` when
 * `restore(client, parentModel, ...)` runs.
 *
 * Mirrors `cascadeRestoreInto` in `soft-delete.helpers.ts`: only rows
 * with `deletedByCascade = true` are counted, so independently-deleted
 * descendants do not inflate the preview.
 *
 * Returns an object keyed by child model name. Empty for models with no
 * cascaded descendants. Throws when `parentModel` is unknown to the
 * soft-delete metadata — surfaces typos instead of silently returning {}.
 */
export async function previewRestoreCascade(
	client: PrismaLikeClient,
	parentModel: string,
	parentId: string,
): Promise<RestoreCascadeCounts> {
	if (!modelIsSoftDeletable(parentModel)) {
		throw new Error(
			`previewRestoreCascade called on non-soft-deletable model "${parentModel}"`,
		);
	}

	const ctx: PreviewContext = { counts: {}, visited: new Set() };
	await walk(client, parentModel, parentId, ctx);
	return ctx.counts;
}
