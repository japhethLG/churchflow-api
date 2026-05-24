import { PrismaClientService } from "@infrastructure/prisma-client/prisma-client.service";
import {
	applyStateFilter,
	restore,
	softDelete,
	withDeleted,
} from "@infrastructure/prisma-client/soft-delete";
import { Injectable } from "@nestjs/common";
import { Pledge, Prisma } from "@prisma/client";
import dayjs from "@shared/dayjs";

import {
	CreatePledgeInput,
	PledgeFilters,
	UpdatePledgeInput,
} from "../pledge.types";

export type PledgeLifecycle =
	| "fulfilled"
	| "on-track"
	| "due-soon"
	| "past-due"
	| "no-deadline"
	| "cancelled";

// Compact relation shapes attached to every pledge row. Surfaces archived
// references (member/campaign/campaignItem) so the FE can render a
// tombstone label rather than dropping the FK silently.
export type PledgeRelations = {
	member: {
		id: string;
		firstName: string;
		lastName: string;
		deletedAt: Date | null;
	};
	campaign: {
		id: string;
		title: string;
		deadline: Date | null;
		deletedAt: Date | null;
	};
	campaignItem: {
		id: string;
		title: string;
		deadline: Date | null;
	} | null;
	resolvedDeadline: string | null;
	daysUntil: number | null;
	lifecycle: PledgeLifecycle;
};

export type PledgeWithAmounts = Pledge & {
	paidAmount: number;
	remainingAmount: number;
};

export type PledgeWithRelations = PledgeWithAmounts & PledgeRelations;

export interface PledgeListResult {
	items: PledgeWithRelations[];
	total: number;
	sum: number;
}

export interface PledgeStatusBucket {
	status: "ACTIVE" | "FULFILLED" | "CANCELLED";
	count: number;
	pledged: number;
	paid: number;
}

export interface PledgeLifecycleBucket {
	lifecycle: PledgeLifecycle;
	count: number;
	outstanding: number;
	share: number;
}

// Cohort-style pledge report driven by `pledge.createdAt`. Answers
// "of pledges started in this window, what is their fulfilment state?".
export interface PledgesReportResult {
	totalPledged: number;
	totalPaid: number;
	totalRemaining: number;
	fulfillmentPct: number;
	totalCount: number;
	statusBreakdown: PledgeStatusBucket[];
	aging: PledgeLifecycleBucket[];
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

// Lifecycle bucket. cancelled > fulfilled > deadline-based.
// Mirrors the FE's `pledgeLifecycle` so dashboards and reports agree.
const deriveLifecycle = (
	status: Pledge["status"],
	pledgedAmount: number,
	paidAmount: number,
	resolvedDeadline: Date | null,
): PledgeLifecycle => {
	if (status === "CANCELLED") {
		return "cancelled";
	}
	if (status === "FULFILLED" || paidAmount >= pledgedAmount) {
		return "fulfilled";
	}
	if (!resolvedDeadline) {
		return "no-deadline";
	}
	const days = dayjs(resolvedDeadline)
		.startOf("day")
		.diff(dayjs().startOf("day"), "day");
	if (days < 0) {
		return "past-due";
	}
	if (days <= 14) {
		return "due-soon";
	}
	return "on-track";
};

// Prisma `include` shape for pledge read paths. campaignItem is optional
// so we opt out of soft-delete auto-filter to surface archived items
// with a tombstone marker. Member and campaign are required relations —
// the extension can't filter them, so tombstones surface naturally and
// the caller must inspect `deletedAt`.
const PLEDGE_RELATION_INCLUDE = {
	member: {
		select: {
			id: true,
			firstName: true,
			lastName: true,
			deletedAt: true,
		},
	},
	campaign: {
		select: {
			id: true,
			title: true,
			deadline: true,
			deletedAt: true,
		},
	},
	campaignItem: {
		where: { deletedAt: undefined },
		select: {
			id: true,
			title: true,
			deadline: true,
		},
	},
} as const;

@Injectable()
export class PledgeRepository {
	constructor(private readonly prisma: PrismaClientService) {}

	async create(data: CreatePledgeInput): Promise<Pledge> {
		return this.prisma.pledge.create({ data });
	}

	async findById(
		tenantId: string,
		id: string,
	): Promise<PledgeWithRelations | null> {
		return this.findByIdInner(tenantId, id, false);
	}

	async findByIdIncludingDeleted(
		tenantId: string,
		id: string,
	): Promise<PledgeWithRelations | null> {
		return this.findByIdInner(tenantId, id, true);
	}

	private async findByIdInner(
		tenantId: string,
		id: string,
		includeDeleted: boolean,
	): Promise<PledgeWithRelations | null> {
		const findArgs = {
			where: { id, tenantId },
			include: PLEDGE_RELATION_INCLUDE,
		};
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
		return this.toWithRelations(pledge, paidAmount);
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
					include: PLEDGE_RELATION_INCLUDE,
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

		const itemsWithRelations: PledgeWithRelations[] = items.map((p) =>
			this.toWithRelations(p, paidByPledgeId[p.id] ?? 0),
		);

		return {
			items: itemsWithRelations,
			total,
			sum: Number(aggregate._sum.pledgedAmount ?? 0),
		};
	}

	// Maps a Prisma pledge (with its included relations) plus the
	// transaction-sum to the `PledgeWithRelations` shape we promise
	// downstream. Computes derived fields: status (auto-fulfilled when
	// payments cover pledged), resolvedDeadline (item > campaign), days
	// until that deadline, and lifecycle bucket.
	private toWithRelations(
		pledge: Pledge & {
			member: {
				id: string;
				firstName: string;
				lastName: string;
				deletedAt: Date | null;
			};
			campaign: {
				id: string;
				title: string;
				deadline: Date | null;
				deletedAt: Date | null;
			};
			campaignItem: {
				id: string;
				title: string;
				deadline: Date | null;
			} | null;
		},
		paidAmount: number,
	): PledgeWithRelations {
		const pledgedAmount = Number(pledge.pledgedAmount);
		const status = deriveStatus(pledge.status, paidAmount, pledgedAmount);
		const resolvedDeadlineDate =
			pledge.campaignItem?.deadline ?? pledge.campaign.deadline;
		const resolvedDeadline = resolvedDeadlineDate
			? dayjs(resolvedDeadlineDate).toISOString()
			: null;
		const daysUntil = resolvedDeadlineDate
			? dayjs(resolvedDeadlineDate)
					.startOf("day")
					.diff(dayjs().startOf("day"), "day")
			: null;
		const lifecycle = deriveLifecycle(
			status,
			pledgedAmount,
			paidAmount,
			resolvedDeadlineDate,
		);
		return {
			...pledge,
			status,
			paidAmount,
			remainingAmount: Math.max(0, pledgedAmount - paidAmount),
			member: pledge.member,
			campaign: pledge.campaign,
			campaignItem: pledge.campaignItem ?? null,
			resolvedDeadline,
			daysUntil,
			lifecycle,
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

	// Cohort-style pledge report for the admin Reports → Pledge Dynamics
	// tab. Filters on `pledge.createdAt` so the date range answers the
	// question "of pledges started in this window, how are they doing?".
	// Computes derived status + lifecycle server-side so every metric on
	// the page agrees.
	async pledgesReport(
		tenantId: string,
		dateFrom: Date | undefined,
		dateTo: Date | undefined,
	): Promise<PledgesReportResult> {
		const createdAt =
			dateFrom || dateTo
				? {
						...(dateFrom ? { gte: dateFrom } : {}),
						...(dateTo ? { lte: dateTo } : {}),
					}
				: undefined;
		const where: Prisma.PledgeWhereInput = {
			tenantId,
			...(createdAt ? { createdAt } : {}),
		};

		const pledges = await this.prisma.pledge.findMany({
			where,
			include: PLEDGE_RELATION_INCLUDE,
		});
		const pledgeIds = pledges.map((p) => p.id);
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
		const enriched = pledges.map((p) =>
			this.toWithRelations(p, paidByPledgeId[p.id] ?? 0),
		);

		// Top-level totals across the cohort.
		let totalPledged = 0;
		let totalPaid = 0;
		let totalRemaining = 0;
		const statusMap = new Map<string, PledgeStatusBucket>([
			["ACTIVE", { status: "ACTIVE", count: 0, pledged: 0, paid: 0 }],
			["FULFILLED", { status: "FULFILLED", count: 0, pledged: 0, paid: 0 }],
			["CANCELLED", { status: "CANCELLED", count: 0, pledged: 0, paid: 0 }],
		]);
		const lifecycleMap = new Map<
			PledgeLifecycle,
			{ count: number; outstanding: number }
		>();
		for (const p of enriched) {
			const pledged = Number(p.pledgedAmount);
			totalPledged += pledged;
			totalPaid += p.paidAmount;
			totalRemaining += p.remainingAmount;
			const bucket = statusMap.get(p.status);
			if (bucket) {
				bucket.count += 1;
				bucket.pledged += pledged;
				bucket.paid += p.paidAmount;
			}
			// Aging only meaningful for not-yet-fulfilled, not-cancelled rows.
			if (p.lifecycle !== "fulfilled" && p.lifecycle !== "cancelled") {
				const agg = lifecycleMap.get(p.lifecycle) ?? {
					count: 0,
					outstanding: 0,
				};
				agg.count += 1;
				agg.outstanding += p.remainingAmount;
				lifecycleMap.set(p.lifecycle, agg);
			}
		}

		const totalOutstandingActive = Array.from(lifecycleMap.values()).reduce(
			(s, b) => s + b.outstanding,
			0,
		);
		const aging: PledgeLifecycleBucket[] = Array.from(lifecycleMap.entries())
			.map(([lifecycle, agg]) => ({
				lifecycle,
				count: agg.count,
				outstanding: agg.outstanding,
				share:
					totalOutstandingActive > 0
						? agg.outstanding / totalOutstandingActive
						: 0,
			}))
			.sort((a, b) => b.outstanding - a.outstanding);

		return {
			totalPledged,
			totalPaid,
			totalRemaining,
			fulfillmentPct: totalPledged > 0 ? totalPaid / totalPledged : 0,
			totalCount: enriched.length,
			statusBreakdown: Array.from(statusMap.values()),
			aging,
		};
	}

	// Returns the most urgent active pledges for the dashboard's
	// outstanding-pledges card. "Urgent" = past-due, due-soon (≤14 days),
	// or on-track with deadline within 30 days. Auto-fulfilled rows
	// (paid ≥ pledged) are excluded — they aren't outstanding anymore.
	// no-deadline pledges are excluded; they aren't time-sensitive.
	//
	// The sort key matches the FE's previous ordering: past-due first
	// (closest to the brink), then due-soon, then on-track-soon by days
	// asc, with remaining amount descending as the tie-breaker.
	async findUrgent(
		tenantId: string,
		limit: number,
	): Promise<PledgeWithRelations[]> {
		const candidates = await this.prisma.pledge.findMany({
			where: { tenantId, status: "ACTIVE" },
			include: PLEDGE_RELATION_INCLUDE,
		});

		const pledgeIds = candidates.map((p) => p.id);
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

		const enriched = candidates.map((p) =>
			this.toWithRelations(p, paidByPledgeId[p.id] ?? 0),
		);

		const URGENCY_RANK: Record<PledgeLifecycle, number> = {
			"past-due": 0,
			"due-soon": 1,
			"on-track": 2,
			fulfilled: 3,
			"no-deadline": 4,
			cancelled: 5,
		};

		return enriched
			.filter((p) => {
				if (p.lifecycle === "past-due" || p.lifecycle === "due-soon") {
					return true;
				}
				if (p.lifecycle === "on-track") {
					return (p.daysUntil ?? Number.POSITIVE_INFINITY) <= 30;
				}
				return false;
			})
			.sort((a, b) => {
				const rank = URGENCY_RANK[a.lifecycle] - URGENCY_RANK[b.lifecycle];
				if (rank !== 0) {
					return rank;
				}
				const aDays = a.daysUntil ?? Number.POSITIVE_INFINITY;
				const bDays = b.daysUntil ?? Number.POSITIVE_INFINITY;
				if (aDays !== bDays) {
					return aDays - bDays;
				}
				return b.remainingAmount - a.remainingAmount;
			})
			.slice(0, limit);
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
