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
		deletedAt: Date | null;
	} | null;
	resolvedDeadline: string | null;
	daysUntil: number | null;
	lifecycle: PledgeLifecycle;
};

// Omits the raw Decimal `paidAmount` column so we can re-type it as a
// number for downstream consumers. The denormalized column is the
// authoritative source; we just surface it as JSON-friendly.
export type PledgeWithAmounts = Omit<Pledge, "paidAmount"> & {
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
	const days = dayjs
		.utc(resolvedDeadline)
		.startOf("day")
		.diff(dayjs.utc().startOf("day"), "day");
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
			deletedAt: true,
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

		// Status filter is a direct column match — auto-transition from
		// ACTIVE → FULFILLED happens at write time in
		// `PledgeRepository.adjustPaidAmount`, so the stored `status` is
		// authoritative for both filtering and pagination.
		const baseWhere: Prisma.PledgeWhereInput = {
			...baseWhereNoStatus,
			...(filters.status ? { status: filters.status } : {}),
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
				deletedAt: Date | null;
			} | null;
		},
		paidAmount: number,
	): PledgeWithRelations {
		const pledgedAmount = Number(pledge.pledgedAmount);
		// `status` is now maintained at write time by
		// PledgeRepository.adjustPaidAmount, so the stored column is
		// authoritative. No JS-side derivation needed.
		const status = pledge.status;
		const resolvedDeadlineDate =
			pledge.campaignItem?.deadline ?? pledge.campaign.deadline;
		const resolvedDeadline = resolvedDeadlineDate
			? dayjs.utc(resolvedDeadlineDate).toISOString()
			: null;
		const daysUntil = resolvedDeadlineDate
			? dayjs
					.utc(resolvedDeadlineDate)
					.startOf("day")
					.diff(dayjs.utc().startOf("day"), "day")
			: null;
		const lifecycle = deriveLifecycle(
			status,
			pledgedAmount,
			paidAmount,
			resolvedDeadlineDate,
		);
		// Drop the raw Decimal `paidAmount` from the spread — we surface a
		// numeric `paidAmount` (derived from transactions) on every read so
		// callers don't have to handle Prisma.Decimal.
		const { paidAmount: _paidAmountColumn, ...rest } = pledge;
		void _paidAmountColumn;
		return {
			...rest,
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

		// SQL-side aggregation now that `paidAmount` is denormalized on the
		// row. statusBreakdown comes from a single groupBy on (status). The
		// aging buckets still need per-pledge lifecycle derivation (depends
		// on resolvedDeadline = campaignItem.deadline ?? campaign.deadline)
		// — Prisma can't express that in WHERE — but we narrow to ACTIVE +
		// unpaid pledges first, so the JS-side loop only sees rows that
		// can land in a non-fulfilled aging bucket.
		const [statusGroup, openPledges] = await Promise.all([
			this.prisma.pledge.groupBy({
				by: ["status"] as const,
				where,
				_count: { _all: true as const },
				_sum: {
					pledgedAmount: true as const,
					paidAmount: true as const,
				},
			}),
			// Only the rows that can land in an aging bucket. Cap at 10000
			// as a backstop — for a tenant with that many open underpaid
			// pledges, the aging chart is already saturated.
			this.prisma.pledge.findMany({
				where: {
					...where,
					status: "ACTIVE",
					paidAmount: { lt: this.prisma.pledge.fields.pledgedAmount },
				},
				select: {
					id: true,
					pledgedAmount: true,
					paidAmount: true,
					status: true,
					campaign: { select: { deadline: true } },
					campaignItem: {
						where: { deletedAt: undefined },
						select: { deadline: true },
					},
				},
				take: 10000,
			}),
		]);

		const statusBreakdown: PledgeStatusBucket[] = (
			["ACTIVE", "FULFILLED", "CANCELLED"] as const
		).map((s) => {
			const row = statusGroup.find((g) => g.status === s);
			return {
				status: s,
				count: row?._count._all ?? 0,
				pledged: Number(row?._sum.pledgedAmount ?? 0),
				paid: Number(row?._sum.paidAmount ?? 0),
			};
		});

		const totalPledged = statusBreakdown.reduce((s, b) => s + b.pledged, 0);
		const totalPaid = statusBreakdown.reduce((s, b) => s + b.paid, 0);
		const totalRemaining = Math.max(0, totalPledged - totalPaid);
		const totalCount = statusBreakdown.reduce((s, b) => s + b.count, 0);

		const lifecycleMap = new Map<
			PledgeLifecycle,
			{ count: number; outstanding: number }
		>();
		for (const p of openPledges) {
			const pledged = Number(p.pledgedAmount);
			const paid = Number(p.paidAmount);
			const remaining = Math.max(0, pledged - paid);
			const resolvedDeadline = p.campaignItem?.deadline ?? p.campaign.deadline;
			const lifecycle = deriveLifecycle(
				p.status,
				pledged,
				paid,
				resolvedDeadline,
			);
			if (lifecycle === "fulfilled" || lifecycle === "cancelled") {
				continue;
			}
			const agg = lifecycleMap.get(lifecycle) ?? { count: 0, outstanding: 0 };
			agg.count += 1;
			agg.outstanding += remaining;
			lifecycleMap.set(lifecycle, agg);
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
			totalCount,
			statusBreakdown,
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
		options: { limit: number; dateFrom?: Date; dateTo?: Date },
	): Promise<PledgeWithRelations[]> {
		// SQL-side narrowing: ACTIVE + unpaid (paidAmount < pledgedAmount)
		// + an effective deadline (campaignItem.deadline ?? campaign.deadline)
		// within the urgency horizon. ACTIVE alone is now reliable because
		// PledgeRepository.adjustPaidAmount keeps the column in sync. The
		// underpayment filter narrows further so we don't fetch rows that
		// would JS-filter out as fulfilled. Three OR branches because
		// Prisma can't express COALESCE in WHERE. Oversample by
		// `limit * 6` so the JS-side sort still has enough rows to pick
		// the top N for unusual deadline distributions.
		//
		// `dateFrom`/`dateTo` bracket `Pledge.createdAt` — used by the
		// admin dashboard's outstanding card to scope to e.g. YTD pledges.
		const { limit, dateFrom, dateTo } = options;
		const horizon = dayjs.utc().add(30, "day").endOf("day").toDate();
		const createdAt =
			dateFrom || dateTo
				? {
						...(dateFrom ? { gte: dateFrom } : {}),
						...(dateTo ? { lte: dateTo } : {}),
					}
				: undefined;
		const candidates = await this.prisma.pledge.findMany({
			where: {
				tenantId,
				status: "ACTIVE",
				paidAmount: { lt: this.prisma.pledge.fields.pledgedAmount },
				...(createdAt ? { createdAt } : {}),
				OR: [
					{ campaignItem: { is: { deadline: { not: null, lte: horizon } } } },
					{
						campaignItemId: null,
						campaign: { is: { deadline: { not: null, lte: horizon } } },
					},
					{
						campaignItem: { is: { deadline: null } },
						campaign: { is: { deadline: { not: null, lte: horizon } } },
					},
				],
			},
			include: PLEDGE_RELATION_INCLUDE,
			take: Math.max(limit * 6, 50),
		});

		// Use the stored paidAmount directly — no transaction.groupBy needed.
		const enriched = candidates.map((p) =>
			this.toWithRelations(p, Number(p.paidAmount)),
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

	// Per-member pledge totals + status counts. Single groupBy — no row
	// transfer. Used by MemberFeatureService.summary; replaces the
	// previous "pull every pledge for this member and reduce in JS"
	// pattern which silently capped at 10000.
	async statsForMember(
		tenantId: string,
		memberId: string,
	): Promise<{
		activePledgesCount: number;
		fulfilledPledgesCount: number;
		cancelledPledgesCount: number;
		pledgedTotal: number;
		paidTotal: number;
	}> {
		const groups = await this.prisma.pledge.groupBy({
			by: ["status"] as const,
			where: { tenantId, memberId },
			_count: { _all: true as const },
			_sum: {
				pledgedAmount: true as const,
				paidAmount: true as const,
			},
		});
		const countByStatus = new Map(groups.map((g) => [g.status, g._count._all]));
		let pledgedTotal = 0;
		let paidTotal = 0;
		for (const g of groups) {
			pledgedTotal += Number(g._sum.pledgedAmount ?? 0);
			paidTotal += Number(g._sum.paidAmount ?? 0);
		}
		return {
			activePledgesCount: countByStatus.get("ACTIVE") ?? 0,
			fulfilledPledgesCount: countByStatus.get("FULFILLED") ?? 0,
			cancelledPledgesCount: countByStatus.get("CANCELLED") ?? 0,
			pledgedTotal,
			paidTotal,
		};
	}

	// Atomically adjust the denormalized `paidAmount` and (when appropriate)
	// flip `status` between ACTIVE and FULFILLED. Runs inside a $transaction
	// so a partial failure can't leave paidAmount out of sync with status.
	// The soft-delete extension blocks the inner update if the pledge is
	// already a tombstone — that's the desired behavior; tombstones don't
	// accept transaction-driven changes.
	//
	// Status semantics:
	// - paid >= pledged + status === ACTIVE → flip to FULFILLED
	// - paid <  pledged + status === FULFILLED → flip back to ACTIVE
	//   (symmetric auto-demotion when a fulfilling Tx is voided)
	// - status === CANCELLED → never touched here; admins manage manually.
	async adjustPaidAmount(
		tenantId: string,
		id: string,
		delta: number,
	): Promise<Pledge> {
		if (delta === 0) {
			return this.prisma.pledge.findFirstOrThrow({
				where: { id, tenantId },
			});
		}
		return this.prisma.$transaction(async (tx) => {
			const incremented = await tx.pledge.update({
				where: { id },
				data: { paidAmount: { increment: delta } },
			});
			const paid = Number(incremented.paidAmount);
			const pledged = Number(incremented.pledgedAmount);
			if (incremented.status === "ACTIVE" && paid >= pledged) {
				return tx.pledge.update({
					where: { id },
					data: { status: "FULFILLED" },
				});
			}
			if (incremented.status === "FULFILLED" && paid < pledged) {
				return tx.pledge.update({
					where: { id },
					data: { status: "ACTIVE" },
				});
			}
			return incremented;
		});
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
