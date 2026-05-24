import { Injectable, NotFoundException } from "@nestjs/common";

import { Transaction } from "@prisma/client";
import {
	BulkCreateItem,
	GiversReportResult,
	TransactionAggregate,
	TransactionListResult,
	TransactionRepository,
	TransactionSummaryOptions,
	TransactionSummaryResult,
	TransactionWithRelations,
	UnattributedSummaryResult,
} from "../repository/transaction.repository";
import {
	CreateTransactionInput,
	TransactionFilters,
	UpdateTransactionInput,
} from "../transaction.types";

@Injectable()
export class TransactionService {
	constructor(private readonly transactionRepository: TransactionRepository) {}

	async create(data: CreateTransactionInput): Promise<Transaction> {
		return this.transactionRepository.create(data);
	}

	async createManyWithAudit(items: BulkCreateItem[]): Promise<Transaction[]> {
		return this.transactionRepository.createManyWithAudit(items);
	}

	async aggregateAll(
		filters: { since?: Date } = {},
	): Promise<TransactionAggregate> {
		return this.transactionRepository.aggregateAll(filters);
	}

	async aggregateForTenant(
		tenantId: string,
		filters: { since?: Date } = {},
	): Promise<TransactionAggregate> {
		return this.transactionRepository.aggregateForTenant(tenantId, filters);
	}

	async getById(
		tenantId: string,
		id: string,
	): Promise<TransactionWithRelations> {
		const tx = await this.transactionRepository.findById(tenantId, id);
		if (!tx) {
			throw new NotFoundException(`Transaction not found: ${id}`);
		}
		return tx;
	}

	async getByIdIncludingDeleted(
		tenantId: string,
		id: string,
	): Promise<TransactionWithRelations> {
		const tx = await this.transactionRepository.findByIdIncludingDeleted(
			tenantId,
			id,
		);
		if (!tx) {
			throw new NotFoundException(`Transaction not found: ${id}`);
		}
		return tx;
	}

	async getAll(
		tenantId: string,
		filters?: TransactionFilters,
	): Promise<TransactionListResult> {
		return this.transactionRepository.findAll(tenantId, filters ?? {});
	}

	async summary(
		tenantId: string,
		dateFrom: Date,
		dateTo: Date,
		options: TransactionSummaryOptions = {},
	): Promise<TransactionSummaryResult> {
		return this.transactionRepository.summary(
			tenantId,
			dateFrom,
			dateTo,
			options,
		);
	}

	async unattributedSummary(
		tenantId: string,
		dateFrom: Date,
		dateTo: Date,
	): Promise<UnattributedSummaryResult> {
		return this.transactionRepository.unattributedSummary(
			tenantId,
			dateFrom,
			dateTo,
		);
	}

	async giversReport(
		tenantId: string,
		dateFrom: Date,
		dateTo: Date,
		limit: number,
	): Promise<GiversReportResult> {
		return this.transactionRepository.giversReport(
			tenantId,
			dateFrom,
			dateTo,
			limit,
		);
	}

	async update(
		tenantId: string,
		id: string,
		data: UpdateTransactionInput,
	): Promise<Transaction> {
		await this.getById(tenantId, id);
		return this.transactionRepository.update(tenantId, id, data);
	}

	async delete(
		tenantId: string,
		id: string,
		actorId: string | null,
	): Promise<Transaction> {
		await this.getById(tenantId, id);
		return this.transactionRepository.softDelete(tenantId, id, actorId);
	}

	async restore(tenantId: string, id: string): Promise<Transaction> {
		await this.getByIdIncludingDeleted(tenantId, id);
		return this.transactionRepository.restore(tenantId, id);
	}

	async reassignMember(
		tenantId: string,
		fromMemberId: string,
		toMemberId: string,
	): Promise<number> {
		return this.transactionRepository.reassignMember(
			tenantId,
			fromMemberId,
			toMemberId,
		);
	}
}
