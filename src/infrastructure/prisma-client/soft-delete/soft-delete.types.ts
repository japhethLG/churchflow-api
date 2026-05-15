import type { PrismaClient } from "@prisma/client";

export const DELETED_AT = "deletedAt" as const;
export const DELETED_BY = "deletedBy" as const;
export const DELETED_BY_CASCADE = "deletedByCascade" as const;

export interface CascadeChild {
	childModel: string;
	foreignKey: string;
}

export interface SoftDeleteArgs {
	where: Record<string, unknown>;
	actorId?: string | null;
}

export interface RestoreArgs {
	where: Record<string, unknown>;
}

/**
 * Shape accepted by the soft-delete helpers (`softDelete`, `restore`).
 * Covers the three concrete callers:
 *   1. the root `PrismaClient` instance (used for stand-alone calls)
 *   2. the transaction client passed to a `$transaction` callback
 *      (`Parameters<PrismaClient['$transaction']>[0]` of the callback form
 *       — Prisma's internal name `TransactionClient`)
 *   3. our extended `PrismaClientService`, which is a `PrismaClient`
 *      subclass.
 *
 * All three share the model-accessor surface that the helpers use
 * (`client.member.findMany`, `client.member.updateMany`, etc). The
 * helpers index into them with a dynamic string — TypeScript can't
 * narrow that without losing all benefit, so the helpers cast on the
 * inside while this type stays honest at the boundary.
 */
export type PrismaTxClient = Parameters<
	Parameters<PrismaClient["$transaction"]>[0]
>[0];

export type PrismaLikeClient = PrismaClient | PrismaTxClient;
