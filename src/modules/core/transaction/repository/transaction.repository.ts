import { PrismaClientService } from "@infrastructure/prisma-client/prisma-client.service";
import { Injectable } from "@nestjs/common";
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

@Injectable()
export class TransactionRepository {
	constructor(private readonly prisma: PrismaClientService) {}

	async create(data: CreateTransactionInput): Promise<Transaction> {
		return this.prisma.transaction.create({ data });
	}

	async findById(tenantId: string, id: string): Promise<Transaction | null> {
		return this.prisma.transaction.findFirst({
			where: { id, tenantId, deletedAt: null },
		});
	}

	async findAll(
		tenantId: string,
		filters: TransactionFilters,
	): Promise<TransactionListResult> {
		const where = this.buildWhere(tenantId, filters);

		const [items, total, aggregate] = await Promise.all([
			this.prisma.transaction.findMany({
				where,
				orderBy: { date: "desc" },
				skip: filters.offset,
				take: filters.limit,
			}),
			this.prisma.transaction.count({ where }),
			this.prisma.transaction.aggregate({ where, _sum: { amount: true } }),
		]);

		return { items, total, sum: Number(aggregate._sum.amount ?? 0) };
	}

	async summary(
		tenantId: string,
		dateFrom: Date,
		dateTo: Date,
	): Promise<TransactionSummaryResult> {
		const where: Prisma.TransactionWhereInput = {
			tenantId,
			deletedAt: null,
			date: { gte: dateFrom, lte: dateTo },
		};

		const [aggregate, byTypeRaw, byMonthRaw] = await Promise.all([
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
			// date_trunc bucketing is simpler + faster in raw SQL than many
			// client-side Date round-trips.
			this.prisma.$queryRaw<
				Array<{ month: Date; total: string | number; count: bigint }>
			>`
        SELECT
          date_trunc('month', "date") AS month,
          SUM("amount")::numeric AS total,
          COUNT(*)::bigint AS count
        FROM "Transaction"
        WHERE "tenantId" = ${tenantId}
          AND "deletedAt" IS NULL
          AND "date" BETWEEN ${dateFrom} AND ${dateTo}
        GROUP BY month
        ORDER BY month ASC
      `,
		]);

		return {
			total: Number(aggregate._sum.amount ?? 0),
			count: aggregate._count._all,
			byType: byTypeRaw.map((row) => ({
				type: row.type,
				total: Number(row._sum.amount ?? 0),
				count: row._count._all,
			})),
			byMonth: byMonthRaw.map((row) => ({
				month: dayjs(row.month).format("YYYY-MM"),
				total: Number(row.total ?? 0),
				count: Number(row.count ?? 0),
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

	async softDelete(_tenantId: string, id: string): Promise<Transaction> {
		return this.prisma.transaction.update({
			where: { id },
			data: { deletedAt: dayjs().toDate() },
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
			deletedAt: null,
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
