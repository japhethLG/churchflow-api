import { applySoftDeleteBypass } from "./soft-delete.walker";

/**
 * `withDeleted(modelName, args)` — Laravel/Rails-style escape hatch.
 *
 * Returns a copy of `args` with `deletedAt: undefined` injected at
 * every point where the extension would otherwise auto-filter. Because
 * the extension treats *any* presence of a `deletedAt` key as the
 * caller opting out, pre-seeding `undefined` everywhere bypasses the
 * default-filter through the entire relation tree:
 *
 *   prisma.member.findMany(
 *     withDeleted("Member", {
 *       where: { tenantId },
 *       include: { pledges: { include: { campaign: true } } },
 *     }),
 *   );
 *
 *   // Returns archived + active members, archived + active pledges,
 *   // archived + active campaigns — without manually adding
 *   // `deletedAt: undefined` at four different levels.
 *
 * Throws if `modelName` is not a model in the Prisma schema so a typo
 * cannot silently no-op.
 *
 * `withDeleted` is generic over `T` so the typed Prisma input is
 * preserved through the call. It does NOT modify scalar selections or
 * relations whose target is not soft-deletable (e.g. AuditEvent).
 */
export function withDeleted<T>(modelName: string, args: T): T {
	return applySoftDeleteBypass(modelName, args);
}
