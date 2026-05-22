import { PrismaClientService } from "@infrastructure/prisma-client/prisma-client.service";
import {
	applyStateFilter,
	restore,
	softDelete,
	withDeleted,
} from "@infrastructure/prisma-client/soft-delete";
import { Injectable } from "@nestjs/common";
import { Pledge, Prisma } from "@prisma/client";

import {
	CreatePledgeInput,
	PledgeFilters,
	UpdatePledgeInput,
} from "../pledge.types";

export type PledgeWithAmounts = Pledge & {
	paidAmount: number;
	remainingAmount: number;
};

export interface PledgeListResult {
	items: PledgeWithAmounts[];
	total: number;
	sum: number;
}

// Derive the surfaced status from stored status + payment totals.
// Active pledges auto-upgrade to FULFILLED when transactions cover the
// pledged amount — stored status is never persisted on this transition
// because paidAmount is itself derived. Explicit CANCELLED and admin-set
// FULFILLED are preserved (a forgiven $0-paid pledge stays FULFILLED).
const deriveStatus = (
	storedStatus: Pledge["status"],
	paidAmount: number,
	pledgedAmount: number,
): Pledge["status"] => {
	if (storedStatus === "ACTIVE" && paidAmount >= pledgedAmount) {
		return "FULFILLED";
	}
	return storedStatus;
};

@Injectable()
export class PledgeRepository {
	constructor(private readonly prisma: PrismaClientService) {}

	async create(data: CreatePledgeInput): Promise<Pledge> {
		return this.prisma.pledge.create({ data });
	}

	async findById(
		tenantId: string,
		id: string,
	): Promise<PledgeWithAmounts | null> {
		return this.findByIdInner(tenantId, id, false);
	}

	async findByIdIncludingDeleted(
		tenantId: string,
		id: string,
	): Promise<PledgeWithAmounts | null> {
		return this.findByIdInner(tenantId, id, true);
	}

	private async findByIdInner(
		tenantId: string,
		id: string,
		includeDeleted: boolean,
	): Promise<PledgeWithAmounts | null> {
		const findArgs = { where: { id, tenantId } };
		const [pledge, aggregate] = await Promise.all([
			includeDeleted
				? this.prisma.pledge.findFirst(withDeleted("Pledge", findArgs))
				: this.prisma.pledge.findFirst(findArgs),
			this.prisma.transaction.aggregate({
				where: { pledgeId: id },
				_sum: { amount: true },
			}),
		]);
		if (!pledge) {
			return null;
		}
		const paidAmount = Number(aggregate._sum.amount ?? 0);
		const pledgedAmount = Number(pledge.pledgedAmount);
		return {
			...pledge,
			status: deriveStatus(pledge.status, paidAmount, pledgedAmount),
			paidAmount,
			remainingAmount: Math.max(0, pledgedAmount - paidAmount),
		};
	}

	async findAll(
		tenantId: string,
		filters: PledgeFilters,
	): Promise<PledgeListResult> {
		const createdAt =
			filters.dateFrom || filters.dateTo
				? {
						...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
						...(filters.dateTo ? { lte: filters.dateTo } : {}),
					}
				: undefined;
		const baseWhereNoStatus: Prisma.PledgeWhereInput = {
			tenantId,
			...(filters.campaignId ? { campaignId: filters.campaignId } : {}),
			...(filters.campaignItemId
				? { campaignItemId: filters.campaignItemId }
				: {}),
			...(filters.memberId ? { memberId: filters.memberId } : {}),
			...(createdAt ? { createdAt } : {}),
		};

		// Status filter must consider the derived state. A stored-ACTIVE
		// pledge whose transactions cover `pledgedAmount` is *displayed* as
		// FULFILLED (see deriveStatus above); the filter has to follow that
		// translation or callers see incoherent rows ("status=ACTIVE returned
		// a FULFILLED row"). We resolve the set of auto-fulfilled ids in JS
		// — there is no Prisma where-syntax for "sum of relation >= column".
		const autoFulfilledIds =
			filters.status === "ACTIVE" || filters.status === "FULFILLED"
				? await this.findAutoFulfilledIds(baseWhereNoStatus, filters)
				: [];

		const statusWhere: Prisma.PledgeWhereInput = (() => {
			if (!filters.status) {
				return {};
			}
			if (filters.status === "ACTIVE") {
				return {
					status: "ACTIVE",
					...(autoFulfilledIds.length > 0
						? { id: { notIn: autoFulfilledIds } }
						: {}),
				};
			}
			if (filters.status === "FULFILLED") {
				return {
					OR: [
						{ status: "FULFILLED" },
						...(autoFulfilledIds.length > 0
							? [{ id: { in: autoFulfilledIds } }]
							: []),
					],
				};
			}
			return { status: filters.status };
		})();

		const baseWhere: Prisma.PledgeWhereInput = {
			...baseWhereNoStatus,
			...statusWhere,
		};
		const { where, wrap } = applyStateFilter("Pledge", baseWhere, filters);

		const [items, total, aggregate] = await Promise.all([
			this.prisma.pledge.findMany(
				wrap({
					where,
					orderBy: { createdAt: "desc" as const },
					skip: filters.offset,
					take: filters.limit,
				}),
			),
			this.prisma.pledge.count(wrap({ where })),
			this.prisma.pledge.aggregate(
				wrap({ where, _sum: { pledgedAmount: true as const } }),
			),
		]);

		const pledgeIds = items.map((p) => p.id);
		const paidGroups =
			pledgeIds.length > 0
				? await this.prisma.transaction.groupBy({
						by: ["pledgeId"],
						where: { pledgeId: { in: pledgeIds } },
						_sum: { amount: true },
					})
				: [];

		const paidByPledgeId = Object.fromEntries(
			paidGroups
				.filter((g) => g.pledgeId !== null)
				.map((g) => [g.pledgeId as string, Number(g._sum.amount ?? 0)]),
		);

		const itemsWithAmounts: PledgeWithAmounts[] = items.map((p) => {
			const paidAmount = paidByPledgeId[p.id] ?? 0;
			const pledgedAmount = Number(p.pledgedAmount);
			return {
				...p,
				status: deriveStatus(p.status, paidAmount, pledgedAmount),
				paidAmount,
				remainingAmount: Math.max(0, pledgedAmount - paidAmount),
			};
		});

		return {
			items: itemsWithAmounts,
			total,
			sum: Number(aggregate._sum.pledgedAmount ?? 0),
		};
	}

	// Returns the ids of stored-ACTIVE pledges in the given filter scope
	// whose transaction sums already cover the pledged amount — i.e. the
	// rows that `deriveStatus` will surface as FULFILLED. Used by the
	// status filter to keep SQL-side pagination correct.
	private async findAutoFulfilledIds(
		baseWhereNoStatus: Prisma.PledgeWhereInput,
		filters: PledgeFilters,
	): Promise<string[]> {
		const { where, wrap } = applyStateFilter(
			"Pledge",
			{ ...baseWhereNoStatus, status: "ACTIVE" as const },
			filters,
		);
		const candidates = await this.prisma.pledge.findMany(
			wrap({ where, select: { id: true, pledgedAmount: true } }),
		);
		if (candidates.length === 0) {
			return [];
		}
		const ids = candidates.map((c) => c.id);
		const paidGroups = await this.prisma.transaction.groupBy({
			by: ["pledgeId"],
			where: { pledgeId: { in: ids } },
			_sum: { amount: true },
		});
		const paidById = Object.fromEntries(
			paidGroups
				.filter((g) => g.pledgeId !== null)
				.map((g) => [g.pledgeId as string, Number(g._sum.amount ?? 0)]),
		);
		return candidates
			.filter((c) => (paidById[c.id] ?? 0) >= Number(c.pledgedAmount))
			.map((c) => c.id);
	}

	async update(
		_tenantId: string,
		id: string,
		data: UpdatePledgeInput,
	): Promise<Pledge> {
		return this.prisma.pledge.update({ where: { id }, data });
	}

	async softDelete(
		tenantId: string,
		id: string,
		actorId: string | null,
	): Promise<Pledge> {
		return this.prisma.$transaction(async (tx) => {
			await softDelete(tx, "Pledge", {
				where: { id, tenantId },
				actorId,
			});
			return tx.pledge.findFirstOrThrow(
				withDeleted("Pledge", { where: { id, tenantId } }),
			);
		});
	}

	async restore(tenantId: string, id: string): Promise<Pledge> {
		return this.prisma.$transaction(async (tx) => {
			await restore(tx, "Pledge", { where: { id, tenantId } });
			return tx.pledge.findFirstOrThrow({ where: { id, tenantId } });
		});
	}

	async reassignMember(
		tenantId: string,
		fromMemberId: string,
		toMemberId: string,
	): Promise<number> {
		const result = await this.prisma.pledge.updateMany({
			where: { tenantId, memberId: fromMemberId },
			data: { memberId: toMemberId },
		});
		return result.count;
	}
}
