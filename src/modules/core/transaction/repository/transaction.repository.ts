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

export interface TransactionListResult {
	items: Transaction[];
	total: number;
	sum: number;
}

export interface TransactionSummaryResult {
	total: number;
	count: number;
	byType: Array<{ type: TransactionType; total: number; count: number }>;
	byMonth: Array<{ month: string; total: number; count: number }>;
}

export interface TransactionAggregate {
	total: number;
	count: number;
}

export interface BulkCreateItem {
	createInput: CreateTransactionInput;
	buildAudit: (row: Transaction) => WriteAuditEventInput;
}

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

	async findById(tenantId: string, id: string): Promise<Transaction | null> {
		return this.prisma.transaction.findFirst({
			where: { id, tenantId },
		});
	}

	async findByIdIncludingDeleted(
		tenantId: string,
		id: string,
	): Promise<Transaction | null> {
		return this.prisma.transaction.findFirst(
			withDeleted("Transaction", { where: { id, tenantId } }),
		);
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

		return { items, total, sum: Number(aggregate._sum.amount ?? 0) };
	}

	// Optional `memberId` filter is the entry point for member-scoped
	// summaries (self-intent endpoint). Pure transactions aggregation —
	// independent of any pledge status logic.
	async summary(
		tenantId: string,
		dateFrom: Date,
		dateTo: Date,
		options: { memberId?: string } = {},
	): Promise<TransactionSummaryResult> {
		const where: Prisma.TransactionWhereInput = {
			tenantId,
			date: { gte: dateFrom, lte: dateTo },
			...(options.memberId ? { memberId: options.memberId } : {}),
		};

		const [aggregate, byTypeRaw, rows] = await Promise.all([
			this.prisma.transaction.aggregate({
				where,
				_sum: { amount: true },
				_count: { _all: true },
			}),
			this.prisma.transaction.groupBy({
				by: ["type"],
				where,
				_sum: { amount: true },
				_count: { _all: true },
			}),
			// Bucket by month in JS so the soft-delete extension's auto-filter
			// applies. $queryRaw bypasses the extension and would surface
			// tombstones.
			this.prisma.transaction.findMany({
				where,
				select: { date: true, amount: true },
			}),
		]);

		const byMonthMap = new Map<string, { total: number; count: number }>();
		for (const row of rows) {
			const month = dayjs(row.date).format("YYYY-MM");
			const bucket = byMonthMap.get(month) ?? { total: 0, count: 0 };
			bucket.total += Number(row.amount);
			bucket.count += 1;
			byMonthMap.set(month, bucket);
		}

		const byMonth = Array.from(byMonthMap.entries())
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([month, agg]) => ({ month, ...agg }));

		return {
			total: Number(aggregate._sum.amount ?? 0),
			count: aggregate._count._all,
			byType: byTypeRaw.map((row) => ({
				type: row.type,
				total: Number(row._sum.amount ?? 0),
				count: row._count._all,
			})),
			byMonth,
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
