import { Injectable, NotFoundException } from "@nestjs/common";

import { Transaction } from "@prisma/client";
import {
	TransactionListResult,
	TransactionRepository,
	TransactionSummaryResult,
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

	async getById(tenantId: string, id: string): Promise<Transaction> {
		const tx = await this.transactionRepository.findById(tenantId, id);
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
	): Promise<TransactionSummaryResult> {
		return this.transactionRepository.summary(tenantId, dateFrom, dateTo);
	}

	async update(
		tenantId: string,
		id: string,
		data: UpdateTransactionInput,
	): Promise<Transaction> {
		await this.getById(tenantId, id);
		return this.transactionRepository.update(tenantId, id, data);
	}

	async delete(tenantId: string, id: string): Promise<Transaction> {
		await this.getById(tenantId, id);
		return this.transactionRepository.softDelete(tenantId, id);
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
