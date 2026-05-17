import { withDeleted } from "./with-deleted";

/**
 * Shared shape for 3-state archive filters across every list endpoint.
 *
 * Encoding:
 *   - Active   → both flags omitted / falsy → BE returns active rows only.
 *   - Deleted  → `onlyDeleted: true`        → BE returns tombstones only.
 *   - All      → `includeDeleted: true`     → BE returns active + tombstones.
 *
 * `onlyDeleted` takes precedence over `includeDeleted` so a caller that sets
 * both (incorrectly) still gets the more specific slice.
 */
export type StateFilterFlags = {
	includeDeleted?: boolean;
	onlyDeleted?: boolean;
};

export type StateFilterResolution<W> = {
	/**
	 * `where` clause with `deletedAt: { not: null }` injected when the
	 * "Deleted" view is requested. For "Active" and "All", `where` is
	 * returned unchanged.
	 */
	where: W;
	/**
	 * Wrap any Prisma args object that the caller is about to pass to a
	 * `findMany` / `findFirst` / `count` / `aggregate` etc. When the
	 * filter requests tombstones (Deleted or All), this routes the call
	 * through `withDeleted` so the soft-delete extension doesn't strip
	 * archived rows. Otherwise it's a no-op.
	 */
	wrap: <A>(args: A) => A;
	/** True when the resolved view is Deleted or All. */
	includeTombstones: boolean;
};

/**
 * Compose a soft-delete-aware `where` + a wrapper helper for the typical
 * list-endpoint repository flow:
 *
 *   const { where, wrap } = applyStateFilter("Member", baseWhere, filters);
 *   const [items, total] = await Promise.all([
 *     this.prisma.member.findMany(wrap({ where, orderBy, skip, take })),
 *     this.prisma.member.count(wrap({ where })),
 *   ]);
 *
 * This centralizes the 3-state encoding so every list endpoint behaves
 * identically and so the "Deleted view = onlyDeleted + withDeleted" idiom
 * cannot regress (the previous hand-rolled version silently returned All
 * because `withDeleted`'s bypass mode used to overwrite the explicit
 * `deletedAt: { not: null }` filter — fixed in `mergeDeletedAt`).
 *
 * Throws via `withDeleted` if `modelName` is not a known Prisma model.
 */
export function applyStateFilter<W extends Record<string, unknown>>(
	modelName: string,
	baseWhere: W,
	flags: StateFilterFlags = {},
): StateFilterResolution<W> {
	const where = flags.onlyDeleted
		? ({ ...baseWhere, deletedAt: { not: null } } as W)
		: baseWhere;
	const includeTombstones = Boolean(flags.onlyDeleted || flags.includeDeleted);
	const wrap = <A>(args: A): A =>
		includeTombstones ? (withDeleted(modelName, args) as A) : args;
	return { where, wrap, includeTombstones };
}
