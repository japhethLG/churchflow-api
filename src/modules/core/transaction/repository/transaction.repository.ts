import { PrismaClientService } from "@infrastructure/prisma-client/prisma-client.service";
import {
	applyStateFilter,
	restore,
	softDelete,
	withDeleted,
} from "@infrastructure/prisma-client/soft-delete";
import type { WriteAuditEventInput } from "@modules/core/audit/audit.types";
import { Injectable, Logger } from "@nestjs/common";
import { Prisma, Transaction, TransactionType } from "@prisma/client";
import dayjs from "@shared/dayjs";

import {
	CreateTransactionInput,
	TransactionFilters,
	UpdateTransactionInput,
} from "../transaction.types";

// Compact relation shapes attached to every transaction row. Lets the
// FE render member name / campaign title / campaign-item title without
// fanning out separate lookup requests. Each embed surfaces its own
// `deletedAt` so the caller can render an archived-row label when the
// referenced entity was soft-deleted after the gift was recorded.
export type TransactionRelations = {
	member: {
		id: string;
		firstName: string;
		lastName: string;
		deletedAt: Date | null;
	} | null;
	campaign: {
		id: string;
		title: string;
		deletedAt: Date | null;
	} | null;
	campaignItem: { id: string; title: string; deletedAt: Date | null } | null;
};

export type TransactionWithRelations = Transaction & TransactionRelations;

export interface TransactionListResult {
	items: TransactionWithRelations[];
	total: number;
	sum: number;
}

export interface TransactionSummaryByCampaignBucket {
	campaignId: string | null;
	campaignTitle: string;
	campaignDeletedAt: string | null;
	total: number;
	count: number;
}

export interface TransactionSummaryResult {
	total: number;
	count: number;
	avg: number;
	firstDate: string | null;
	lastDate: string | null;
	byType: Array<{
		type: TransactionType;
		total: number;
		count: number;
		avg: number;
	}>;
	byMonth: Array<{ month: string; total: number; count: number }>;
	byCampaign: TransactionSummaryByCampaignBucket[];
}

export interface TransactionSummaryOptions {
	memberId?: string;
	campaignId?: string;
	type?: TransactionType;
	includeDeleted?: boolean;
	onlyDeleted?: boolean;
	// Whether to compute the per-month `byMonth` series. Defaults to true.
	// Callers that only read the scalar totals (the member/transaction
	// detail "lifetime" strips) pass `false` — this skips the monthly
	// bucketing entirely, which is what makes an unbounded lifetime window
	// cheap instead of fanning out one query per month across centuries.
	withMonthly?: boolean;
}

export interface GiverByTypeBucket {
	type: TransactionType;
	amount: number;
	count: number;
	share: number;
}

export interface GiverByCampaignBucket {
	campaignId: string;
	campaignTitle: string;
	campaignDeletedAt: string | null;
	amount: number;
	share: number;
}

export interface GiverMonthlyBucket {
	month: string; // YYYY-MM UTC
	amount: number;
}

export interface GiverRow {
	memberId: string;
	memberFirstName: string;
	memberLastName: string;
	memberDeletedAt: string | null;
	total: number;
	count: number;
	avg: number;
	byType: GiverByTypeBucket[];
	byCampaign: GiverByCampaignBucket[];
	monthlyTotals: GiverMonthlyBucket[];
}

export interface GiversReportResult {
	items: GiverRow[];
	// Months that make up `monthlyTotals` (same labels on every row), so
	// the FE can render axis labels even when a giver has no gifts in
	// some buckets.
	months: string[];
}

// Per-member monthly giving series, aligned to a shared `months` axis.
// Backs the members-list sparklines (replacing a fetch-500-and-bucket-in-JS
// over-fetch on the client).
export interface GivingTrendResult {
	months: string[]; // YYYY-MM UTC, chronological
	items: Array<{ memberId: string; monthlyTotals: number[] }>;
}

// Snapshot of gifts in the window that lack attribution. Powers the
// dashboard's "Unattributed gifts" callout.
export interface UnattributedSummaryResult {
	anonymousCount: number;
	anonymousTotal: number;
	noCampaignCount: number;
	noCampaignTotal: number;
}

export interface TransactionAggregate {
	total: number;
	count: number;
}

export interface BulkCreateItem {
	createInput: CreateTransactionInput;
	buildAudit: (row: Transaction) => WriteAuditEventInput;
}

// Prisma `include` shape for transaction read paths. Each nested `where`
// passes `deletedAt: undefined` to opt out of the soft-delete extension's
// auto-injection — we want tombstoned references to surface on the row so
// the FE can render a "Deleted member" / "Deleted campaign" label rather
// than dropping the FK silently.
const TRANSACTION_RELATION_INCLUDE = {
	member: {
		where: { deletedAt: undefined },
		select: {
			id: true,
			firstName: true,
			lastName: true,
			deletedAt: true,
		},
	},
	campaign: {
		where: { deletedAt: undefined },
		select: {
			id: true,
			title: true,
			deletedAt: true,
		},
	},
	campaignItem: {
		where: { deletedAt: undefined },
		select: {
			id: true,
			title: true,
			deletedAt: true,
		},
	},
} as const;

@Injectable()
export class TransactionRepository {
	private readonly logger = new Logger(TransactionRepository.name);

	constructor(private readonly prisma: PrismaClientService) {}

	async create(data: CreateTransactionInput): Promise<Transaction> {
		return this.prisma.transaction.create({ data });
	}

	// Atomic bulk insert with paired audit events. Audit-write failures are
	// swallowed-and-logged to match AuditService.record's behaviour, so an
	// audit hiccup never rolls back the user's gifts.
	async createManyWithAudit(items: BulkCreateItem[]): Promise<Transaction[]> {
		return this.prisma.$transaction(async (tx) => {
			const created: Transaction[] = [];
			for (const item of items) {
				const row = await tx.transaction.create({ data: item.createInput });
				const auditInput = item.buildAudit(row);
				try {
					await tx.auditEvent.create({
						data: {
							tenantId: auditInput.tenantId,
							actorUid: auditInput.actorUid,
							actorEmail: auditInput.actorEmail ?? null,
							action: auditInput.action,
							entity: auditInput.entity,
							entityId: auditInput.entityId,
							summary: auditInput.summary ?? null,
							diff: (auditInput.diff ?? null) as Prisma.InputJsonValue,
						},
					});
				} catch (err) {
					this.logger.error(
						`audit write failed inside bulk (entityId=${row.id}): ${(err as Error).message}`,
					);
				}
				created.push(row);
			}
			return created;
		});
	}

	// Cross-tenant aggregate for platform stats.
	async aggregateAll(
		filters: { since?: Date } = {},
	): Promise<TransactionAggregate> {
		const agg = await this.prisma.transaction.aggregate({
			where: filters.since ? { date: { gte: filters.since } } : undefined,
			_sum: { amount: true },
			_count: { _all: true },
		});
		return {
			total: Number(agg._sum.amount ?? 0),
			count: agg._count._all,
		};
	}

	// Tenant-scoped aggregate with optional date floor.
	async aggregateForTenant(
		tenantId: string,
		filters: { since?: Date } = {},
	): Promise<TransactionAggregate> {
		const agg = await this.prisma.transaction.aggregate({
			where: {
				tenantId,
				...(filters.since ? { date: { gte: filters.since } } : {}),
			},
			_sum: { amount: true },
			_count: { _all: true },
		});
		return {
			total: Number(agg._sum.amount ?? 0),
			count: agg._count._all,
		};
	}

	// Per-tenant totals across many tenants in one groupBy — backs the
	// super-admin tenant list's gift columns instead of one aggregate per
	// tenant row.
	async aggregateByTenant(
		tenantIds: string[],
		filters: { since?: Date } = {},
	): Promise<Map<string, TransactionAggregate>> {
		const byTenant = new Map<string, TransactionAggregate>();
		if (tenantIds.length === 0) {
			return byTenant;
		}
		const rows = await this.prisma.transaction.groupBy({
			by: ["tenantId"],
			where: {
				tenantId: { in: tenantIds },
				...(filters.since ? { date: { gte: filters.since } } : {}),
			},
			_sum: { amount: true },
			_count: { _all: true },
		});
		for (const r of rows) {
			byTenant.set(r.tenantId, {
				total: Number(r._sum.amount ?? 0),
				count: r._count._all,
			});
		}
		return byTenant;
	}

	async findById(
		tenantId: string,
		id: string,
	): Promise<TransactionWithRelations | null> {
		const row = await this.prisma.transaction.findFirst({
			where: { id, tenantId },
			include: TRANSACTION_RELATION_INCLUDE,
		});
		return row ? this.toWithRelations(row) : null;
	}

	async findByIdIncludingDeleted(
		tenantId: string,
		id: string,
	): Promise<TransactionWithRelations | null> {
		const row = await this.prisma.transaction.findFirst(
			withDeleted("Transaction", {
				where: { id, tenantId },
				include: TRANSACTION_RELATION_INCLUDE,
			}),
		);
		return row ? this.toWithRelations(row) : null;
	}

	async findAll(
		tenantId: string,
		filters: TransactionFilters,
	): Promise<TransactionListResult> {
		const baseWhere = this.buildWhere(tenantId, filters);
		const { where, wrap } = applyStateFilter(
			"Transaction",
			baseWhere as Record<string, unknown>,
			filters,
		);

		const [items, total, aggregate] = await Promise.all([
			this.prisma.transaction.findMany(
				wrap({
					where,
					include: TRANSACTION_RELATION_INCLUDE,
					orderBy: { date: "desc" as const },
					skip: filters.offset,
					take: filters.limit,
				}),
			),
			this.prisma.transaction.count(wrap({ where })),
			this.prisma.transaction.aggregate(
				wrap({ where, _sum: { amount: true as const } }),
			),
		]);

		return {
			items: items.map((row) => this.toWithRelations(row)),
			total,
			sum: Number(aggregate._sum.amount ?? 0),
		};
	}

	// Tenant-scoped aggregation that respects the full filter set the list
	// endpoint accepts (member, campaign, type, soft-delete state). Returning
	// the same shape regardless of which filters were applied keeps the
	// summary card and the table next to it from diverging.
	async summary(
		tenantId: string,
		dateFrom: Date,
		dateTo: Date,
		options: TransactionSummaryOptions = {},
	): Promise<TransactionSummaryResult> {
		const baseWhere: Prisma.TransactionWhereInput = {
			tenantId,
			date: { gte: dateFrom, lte: dateTo },
			...(options.memberId ? { memberId: options.memberId } : {}),
			...(options.campaignId ? { campaignId: options.campaignId } : {}),
			...(options.type ? { type: options.type } : {}),
		};
		const { where, wrap } = applyStateFilter(
			"Transaction",
			baseWhere as Record<string, unknown>,
			options,
		);

		const withMonthly = options.withMonthly ?? true;

		const [aggregate, byTypeRaw, byCampaignRaw, monthlyRows] =
			await Promise.all([
				this.prisma.transaction.aggregate(
					wrap({
						where,
						_sum: { amount: true as const },
						_count: { _all: true as const },
						_min: { date: true as const },
						_max: { date: true as const },
					}),
				),
				this.prisma.transaction.groupBy(
					wrap({
						by: ["type"] as const,
						where,
						_sum: { amount: true as const },
						_count: { _all: true as const },
					}),
				),
				this.prisma.transaction.groupBy(
					wrap({
						by: ["campaignId"] as const,
						where,
						_sum: { amount: true as const },
						_count: { _all: true as const },
					}),
				),
				// byMonth in a SINGLE windowed read. We select only
				// {date, amount} (tiny transfer, served from the
				// (tenantId, date) index) and bucket in JS — the sanctioned
				// alternative to a date_trunc $queryRaw, which would bypass
				// the soft-delete extension (backend CLAUDE.md §11). This
				// replaces the previous one-aggregate-per-month fan-out, so
				// a 5-year (or accidentally unbounded) range costs one query
				// instead of dozens. Skipped entirely when the caller doesn't
				// render a monthly series.
				withMonthly
					? this.prisma.transaction.findMany(
							wrap({ where, select: { date: true, amount: true } }),
						)
					: Promise.resolve(
							[] as Array<{ date: Date; amount: Prisma.Decimal }>,
						),
			]);

		const byMonth = withMonthly
			? this.bucketByMonth(monthlyRows, dateFrom, dateTo)
			: [];

		// Resolve campaign titles + tombstone flags for the byCampaign
		// breakdown. `withDeleted` so archived campaigns still surface a
		// label (matches the rest of the file's tombstone-aware embeds).
		const campaignIds = byCampaignRaw
			.map((b) => b.campaignId)
			.filter((id): id is string => id !== null);
		const campaignLookup =
			campaignIds.length > 0
				? await this.prisma.campaign.findMany(
						withDeleted("Campaign", {
							where: { id: { in: campaignIds } },
							select: { id: true, title: true, deletedAt: true },
						}),
					)
				: [];
		const campaignById = new Map(campaignLookup.map((c) => [c.id, c]));

		const byCampaign: TransactionSummaryByCampaignBucket[] = byCampaignRaw
			.map((row) => {
				const c = row.campaignId ? campaignById.get(row.campaignId) : null;
				return {
					campaignId: row.campaignId,
					campaignTitle: c?.title ?? "No campaign",
					campaignDeletedAt: c?.deletedAt
						? dayjs(c.deletedAt).toISOString()
						: null,
					total: Number(row._sum.amount ?? 0),
					count: row._count._all,
				};
			})
			.sort((a, b) => b.total - a.total);

		const total = Number(aggregate._sum.amount ?? 0);
		const count = aggregate._count._all;
		return {
			total,
			count,
			avg: count > 0 ? total / count : 0,
			firstDate: aggregate._min.date
				? dayjs.utc(aggregate._min.date).toISOString()
				: null,
			lastDate: aggregate._max.date
				? dayjs.utc(aggregate._max.date).toISOString()
				: null,
			byType: byTypeRaw.map((row) => {
				const segTotal = Number(row._sum.amount ?? 0);
				const segCount = row._count._all;
				return {
					type: row.type,
					total: segTotal,
					count: segCount,
					avg: segCount > 0 ? segTotal / segCount : 0,
				};
			}),
			byMonth,
			byCampaign,
		};
	}

	// Counts and totals of unattributed gifts in the window (anonymous =
	// no memberId; no-campaign = no campaignId). Two independent
	// aggregations executed in parallel — single SQL roundtrip per axis.
	async unattributedSummary(
		tenantId: string,
		dateFrom: Date,
		dateTo: Date,
	): Promise<UnattributedSummaryResult> {
		const dateRange = { gte: dateFrom, lte: dateTo };
		const [anon, noCampaign] = await Promise.all([
			this.prisma.transaction.aggregate({
				where: { tenantId, date: dateRange, memberId: null },
				_sum: { amount: true },
				_count: { _all: true },
			}),
			this.prisma.transaction.aggregate({
				where: { tenantId, date: dateRange, campaignId: null },
				_sum: { amount: true },
				_count: { _all: true },
			}),
		]);
		return {
			anonymousCount: anon._count._all,
			anonymousTotal: Number(anon._sum.amount ?? 0),
			noCampaignCount: noCampaign._count._all,
			noCampaignTotal: Number(noCampaign._sum.amount ?? 0),
		};
	}

	// Top-N givers report for the admin Reports page. Everything is
	// computed server-side in five queries: groupBy memberId to rank
	// givers, then groupBy [member,type] / [member,campaign] / findMany
	// for monthly buckets within the top-N memberIds, plus a lookup for
	// member names + campaign titles. Replaces the FE's previous
	// fetch-500-and-reduce pattern.
	async giversReport(
		tenantId: string,
		dateFrom: Date,
		dateTo: Date,
		limit: number,
	): Promise<GiversReportResult> {
		const monthStart = dayjs.utc(dateFrom).startOf("month");
		const monthEnd = dayjs.utc(dateTo).startOf("month");
		const monthCount = Math.max(0, monthEnd.diff(monthStart, "month")) + 1;
		const months: string[] = [];
		for (let i = 0; i < monthCount; i += 1) {
			months.push(monthStart.add(i, "month").format("YYYY-MM"));
		}

		const baseWhere: Prisma.TransactionWhereInput = {
			tenantId,
			date: { gte: dateFrom, lte: dateTo },
			memberId: { not: null },
		};

		// 1. Rank: top-N memberIds by total amount in the window.
		const ranked = await this.prisma.transaction.groupBy({
			by: ["memberId"],
			where: baseWhere,
			_sum: { amount: true },
			_count: { _all: true },
			orderBy: { _sum: { amount: "desc" as const } },
			take: limit,
		});
		const memberIds = ranked
			.map((r) => r.memberId)
			.filter((id): id is string => id !== null);

		if (memberIds.length === 0) {
			return { items: [], months };
		}

		const scopedWhere: Prisma.TransactionWhereInput = {
			...baseWhere,
			memberId: { in: memberIds },
		};

		// 2-4. Per-type, per-campaign, monthly. Run in parallel.
		const [byTypeRaw, byCampaignRaw, monthlyRowsRaw, members, campaigns] =
			await Promise.all([
				this.prisma.transaction.groupBy({
					by: ["memberId", "type"] as const,
					where: scopedWhere,
					_sum: { amount: true },
					_count: { _all: true },
				}),
				this.prisma.transaction.groupBy({
					by: ["memberId", "campaignId"] as const,
					where: scopedWhere,
					_sum: { amount: true },
				}),
				this.prisma.transaction.findMany({
					where: scopedWhere,
					select: { memberId: true, date: true, amount: true },
				}),
				this.prisma.member.findMany(
					withDeleted("Member", {
						where: { tenantId, id: { in: memberIds } },
						select: {
							id: true,
							firstName: true,
							lastName: true,
							deletedAt: true,
						},
					}),
				),
				this.prisma.campaign.findMany(
					withDeleted("Campaign", {
						where: { tenantId },
						select: { id: true, title: true, deletedAt: true },
					}),
				),
			]);

		const memberById = new Map(members.map((m) => [m.id, m]));
		const campaignById = new Map(campaigns.map((c) => [c.id, c]));

		// Per-member type buckets.
		const typeByMember = new Map<string, GiverByTypeBucket[]>();
		for (const row of byTypeRaw) {
			if (!row.memberId) {
				continue;
			}
			const list = typeByMember.get(row.memberId) ?? [];
			list.push({
				type: row.type,
				amount: Number(row._sum.amount ?? 0),
				count: row._count._all,
				share: 0,
			});
			typeByMember.set(row.memberId, list);
		}

		// Per-member campaign buckets.
		const campaignByMember = new Map<string, GiverByCampaignBucket[]>();
		for (const row of byCampaignRaw) {
			if (!row.memberId) {
				continue;
			}
			const list = campaignByMember.get(row.memberId) ?? [];
			const campaignId = row.campaignId ?? "";
			const campaign = campaignId ? campaignById.get(campaignId) : null;
			list.push({
				campaignId,
				campaignTitle: campaign?.title ?? "No campaign",
				campaignDeletedAt: campaign?.deletedAt
					? dayjs(campaign.deletedAt).toISOString()
					: null,
				amount: Number(row._sum.amount ?? 0),
				share: 0,
			});
			campaignByMember.set(row.memberId, list);
		}

		// Per-member monthly buckets (skeleton: 0 in each month).
		const monthlyByMember = new Map<string, Map<string, number>>();
		for (const id of memberIds) {
			const skel = new Map<string, number>();
			for (const m of months) {
				skel.set(m, 0);
			}
			monthlyByMember.set(id, skel);
		}
		for (const row of monthlyRowsRaw) {
			if (!row.memberId) {
				continue;
			}
			const month = dayjs.utc(row.date).format("YYYY-MM");
			const bucket = monthlyByMember.get(row.memberId);
			if (!bucket?.has(month)) {
				continue;
			}
			bucket.set(month, (bucket.get(month) ?? 0) + Number(row.amount));
		}

		const items: GiverRow[] = ranked
			.filter((r): r is typeof r & { memberId: string } => r.memberId !== null)
			.map((r) => {
				const member = memberById.get(r.memberId);
				const total = Number(r._sum.amount ?? 0);
				const count = r._count._all;
				const byType = (typeByMember.get(r.memberId) ?? [])
					.map((b) => ({ ...b, share: total > 0 ? b.amount / total : 0 }))
					.sort((a, b) => b.amount - a.amount);
				const byCampaign = (campaignByMember.get(r.memberId) ?? [])
					.map((b) => ({ ...b, share: total > 0 ? b.amount / total : 0 }))
					.sort((a, b) => b.amount - a.amount);
				const monthlyMap = monthlyByMember.get(r.memberId) ?? new Map();
				const monthlyTotals = months.map((m) => ({
					month: m,
					amount: monthlyMap.get(m) ?? 0,
				}));
				return {
					memberId: r.memberId,
					memberFirstName: member?.firstName ?? "",
					memberLastName: member?.lastName ?? "",
					memberDeletedAt: member?.deletedAt
						? dayjs(member.deletedAt).toISOString()
						: null,
					total,
					count,
					avg: count > 0 ? total / count : 0,
					byType,
					byCampaign,
					monthlyTotals,
				};
			});

		return { items, months };
	}

	// Monthly giving series for a bounded set of members (the members-list
	// page passes the ids it's showing). One windowed read selecting
	// {memberId, date, amount}, bucketed in JS — scoped by memberId so it
	// stays small regardless of tenant size, and never $queryRaw (which
	// would bypass the soft-delete extension).
	async givingTrendByMember(
		tenantId: string,
		memberIds: string[],
		dateFrom: Date,
		dateTo: Date,
	): Promise<GivingTrendResult> {
		const monthStart = dayjs.utc(dateFrom).startOf("month");
		const monthEndInclusive = dayjs.utc(dateTo).startOf("month");
		const monthCount =
			Math.max(0, monthEndInclusive.diff(monthStart, "month")) + 1;
		const months = Array.from({ length: monthCount }, (_, i) =>
			monthStart.add(i, "month").format("YYYY-MM"),
		);
		if (memberIds.length === 0) {
			return { months, items: [] };
		}

		const monthIndex = new Map(months.map((m, i) => [m, i]));
		const rows = await this.prisma.transaction.findMany({
			where: {
				tenantId,
				memberId: { in: memberIds },
				date: { gte: dateFrom, lte: dateTo },
			},
			select: { memberId: true, date: true, amount: true },
		});

		const totalsByMember = new Map<string, number[]>(
			memberIds.map((id) => [id, new Array(monthCount).fill(0)]),
		);
		for (const row of rows) {
			if (!row.memberId) {
				continue;
			}
			const idx = monthIndex.get(dayjs.utc(row.date).format("YYYY-MM"));
			const totals = totalsByMember.get(row.memberId);
			if (totals && idx !== undefined) {
				totals[idx] += Number(row.amount);
			}
		}

		return {
			months,
			items: memberIds.map((memberId) => ({
				memberId,
				monthlyTotals:
					totalsByMember.get(memberId) ?? new Array(monthCount).fill(0),
			})),
		};
	}

	async update(
		_tenantId: string,
		id: string,
		data: UpdateTransactionInput,
	): Promise<Transaction> {
		return this.prisma.transaction.update({ where: { id }, data });
	}

	async softDelete(
		tenantId: string,
		id: string,
		actorId: string | null,
	): Promise<Transaction> {
		return this.prisma.$transaction(async (tx) => {
			await softDelete(tx, "Transaction", {
				where: { id, tenantId },
				actorId,
			});
			return tx.transaction.findFirstOrThrow(
				withDeleted("Transaction", { where: { id, tenantId } }),
			);
		});
	}

	async restore(tenantId: string, id: string): Promise<Transaction> {
		return this.prisma.$transaction(async (tx) => {
			await restore(tx, "Transaction", { where: { id, tenantId } });
			return tx.transaction.findFirstOrThrow({ where: { id, tenantId } });
		});
	}

	// Reassign every transaction belonging to one member to another. Used by
	// the merge flow. Soft-deleted rows are intentionally moved too — keeps
	// the audit trail intact even if either side has historical deletions.
	async reassignMember(
		tenantId: string,
		fromMemberId: string,
		toMemberId: string,
	): Promise<number> {
		const result = await this.prisma.transaction.updateMany({
			where: { tenantId, memberId: fromMemberId },
			data: { memberId: toMemberId },
		});
		return result.count;
	}

	// Projects a Prisma transaction with its included relations down to
	// the compact `TransactionRelations` shape we promise downstream.
	private toWithRelations(
		row: Transaction & {
			member?: {
				id: string;
				firstName: string;
				lastName: string;
				deletedAt: Date | null;
			} | null;
			campaign?: {
				id: string;
				title: string;
				deletedAt: Date | null;
			} | null;
			campaignItem?: {
				id: string;
				title: string;
				deletedAt: Date | null;
			} | null;
		},
	): TransactionWithRelations {
		const { member, campaign, campaignItem, ...rest } = row;
		return {
			...(rest as Transaction),
			member: member ?? null,
			campaign: campaign ?? null,
			campaignItem: campaignItem ?? null,
		};
	}

	// Buckets a flat list of {date, amount} rows into a zero-filled,
	// chronologically-ordered YYYY-MM series spanning [dateFrom, dateTo].
	// Keeping the skeleton means months with no gifts still render a 0 on
	// the FE trend chart.
	private bucketByMonth(
		rows: Array<{ date: Date; amount: Prisma.Decimal }>,
		dateFrom: Date,
		dateTo: Date,
	): Array<{ month: string; total: number; count: number }> {
		const monthStart = dayjs.utc(dateFrom).startOf("month");
		const monthEndInclusive = dayjs.utc(dateTo).startOf("month");
		const monthCount =
			Math.max(0, monthEndInclusive.diff(monthStart, "month")) + 1;

		const buckets = new Map<string, { total: number; count: number }>();
		for (let i = 0; i < monthCount; i += 1) {
			buckets.set(monthStart.add(i, "month").format("YYYY-MM"), {
				total: 0,
				count: 0,
			});
		}
		for (const row of rows) {
			const bucket = buckets.get(dayjs.utc(row.date).format("YYYY-MM"));
			if (bucket) {
				bucket.total += Number(row.amount);
				bucket.count += 1;
			}
		}
		return Array.from(buckets, ([month, v]) => ({
			month,
			total: v.total,
			count: v.count,
		}));
	}

	private buildWhere(
		tenantId: string,
		filters: TransactionFilters,
	): Prisma.TransactionWhereInput {
		return {
			tenantId,
			...(filters.memberId ? { memberId: filters.memberId } : {}),
			...(filters.campaignId ? { campaignId: filters.campaignId } : {}),
			...(filters.campaignItemId
				? { campaignItemId: filters.campaignItemId }
				: {}),
			...(filters.pledgeId ? { pledgeId: filters.pledgeId } : {}),
			...(filters.type ? { type: filters.type } : {}),
			...(filters.dateFrom || filters.dateTo
				? { date: { gte: filters.dateFrom, lte: filters.dateTo } }
				: {}),
		};
	}
}
