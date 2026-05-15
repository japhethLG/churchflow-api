import { Prisma } from "@prisma/client";

import { modelIsSoftDeletable } from "./soft-delete.dmmf";
import { DELETED_AT } from "./soft-delete.types";
import { applySoftDeleteFilters } from "./soft-delete.walker";

/**
 * Soft-delete Prisma extension.
 *
 * Industry-standard behavior: every relation that points at a
 * soft-deletable model is filtered to active rows by default, at every
 * level of nesting. Top-level reads, relation predicates inside `where`,
 * relation arguments inside `include`/`select`, and `_count` of
 * relations all participate.
 *
 *  1. Reads (findMany / findFirst / count / aggregate / groupBy /
 *     findUnique): walker injects `deletedAt: null` everywhere a
 *     soft-deletable model is filterable. `findUnique` keeps the
 *     post-query check + projection widening so a custom `select` can't
 *     fail open.
 *
 *  2. Writes (update / updateMany / updateManyAndReturn / upsert /
 *     delete / deleteMany): same walker — tombstones are immutable.
 *
 *  3. Escape hatch: include `deletedAt` (any value, including
 *     `undefined`) anywhere a `where` clause appears. The `withDeleted`
 *     helper from [soft-delete.helpers.ts](./soft-delete.helpers.ts)
 *     pre-fills this everywhere so callers don't have to thread it
 *     manually.
 *
 *  4. Required to-one relations: Prisma's generated `XxxDefaultArgs`
 *     type has no `where` field — we can't filter them without lying
 *     about non-null. Tombstones surface there; callers inspect
 *     `deletedAt` on the returned object. The walker passes them
 *     through unchanged.
 *
 * Models without both `deletedAt` and `deletedByCascade` (e.g.
 * AuditEvent) are passed through unchanged.
 */

type ArgsBag = { where?: Record<string, unknown> } & Record<string, unknown>;

function hasExplicitDeletedAtFilter(where: unknown): boolean {
	return typeof where === "object" && where !== null && DELETED_AT in where;
}

function widenProjectionForDeletedAt<T>(args: T): {
	widened: T;
	addedToSelect: boolean;
} {
	const bag = (args ?? {}) as ArgsBag & {
		select?: Record<string, unknown>;
		omit?: Record<string, unknown>;
	};

	if (bag.select && !(DELETED_AT in bag.select)) {
		return {
			widened: {
				...bag,
				select: { ...bag.select, [DELETED_AT]: true },
			} as T,
			addedToSelect: true,
		};
	}

	if (bag.omit && bag.omit[DELETED_AT] === true) {
		const { [DELETED_AT]: _, ...rest } = bag.omit;
		void _;
		return {
			widened: { ...bag, omit: rest } as T,
			addedToSelect: false,
		};
	}

	return { widened: args, addedToSelect: false };
}

function stripDeletedAtField<T extends object | null>(
	result: T,
	added: boolean,
): T {
	if (!added || result === null) {
		return result;
	}
	const { [DELETED_AT]: _, ...rest } = result as Record<string, unknown>;
	void _;
	return rest as T;
}

export const softDeleteExtension = Prisma.defineExtension({
	name: "softDelete",
	query: {
		$allModels: {
			async findMany({ model, args, query }) {
				return query(applySoftDeleteFilters(model, args));
			},

			async findFirst({ model, args, query }) {
				return query(applySoftDeleteFilters(model, args));
			},

			async findFirstOrThrow({ model, args, query }) {
				return query(applySoftDeleteFilters(model, args));
			},

			async findUnique({ model, args, query }) {
				if (!modelIsSoftDeletable(model)) {
					return query(applySoftDeleteFilters(model, args));
				}
				if (hasExplicitDeletedAtFilter((args as ArgsBag).where)) {
					return query(applySoftDeleteFilters(model, args));
				}

				// Prisma 5+ extended `WhereUniqueInput` to accept non-unique
				// filters, so the walker's `deletedAt: null` injection is the
				// primary defense and Prisma rejects the tombstone at the DB.
				// We KEEP the projection-widening + post-query check as
				// belt-and-suspenders: it guards against future Prisma changes
				// and against unusual `select` shapes that might surface a
				// soft-deleted row through a buggy code path.
				const filtered = applySoftDeleteFilters(model, args);
				const { widened, addedToSelect } =
					widenProjectionForDeletedAt(filtered);
				const result = (await query(widened)) as
					| (Record<string, unknown> & { deletedAt?: Date | null })
					| null;
				if (result?.deletedAt) {
					return null;
				}
				return stripDeletedAtField(result, addedToSelect);
			},

			async findUniqueOrThrow({ model, args, query }) {
				if (!modelIsSoftDeletable(model)) {
					return query(applySoftDeleteFilters(model, args));
				}
				if (hasExplicitDeletedAtFilter((args as ArgsBag).where)) {
					return query(applySoftDeleteFilters(model, args));
				}

				// See findUnique comment above — same defensive layering.
				const filtered = applySoftDeleteFilters(model, args);
				const { widened, addedToSelect } =
					widenProjectionForDeletedAt(filtered);
				const result = (await query(widened)) as Record<string, unknown> & {
					deletedAt?: Date | null;
				};
				if (result.deletedAt) {
					throw new Prisma.PrismaClientKnownRequestError(`No ${model} found`, {
						code: "P2025",
						clientVersion: Prisma.prismaVersion.client,
					});
				}
				return stripDeletedAtField(result, addedToSelect);
			},

			async count({ model, args, query }) {
				return query(applySoftDeleteFilters(model, args));
			},

			async aggregate({ model, args, query }) {
				return query(applySoftDeleteFilters(model, args));
			},

			async groupBy({ model, args, query }) {
				return query(applySoftDeleteFilters(model, args));
			},

			async update({ model, args, query }) {
				return query(applySoftDeleteFilters(model, args));
			},

			async updateMany({ model, args, query }) {
				return query(applySoftDeleteFilters(model, args));
			},

			async updateManyAndReturn({ model, args, query }) {
				return query(applySoftDeleteFilters(model, args));
			},

			async upsert({ model, args, query }) {
				return query(applySoftDeleteFilters(model, args));
			},

			async delete({ model, args, query }) {
				return query(applySoftDeleteFilters(model, args));
			},

			async deleteMany({ model, args, query }) {
				return query(applySoftDeleteFilters(model, args));
			},
		},
	},
});
