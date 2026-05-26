import { Injectable, NotFoundException } from "@nestjs/common";

import { Pledge } from "@prisma/client";

import {
	CreatePledgeInput,
	PledgeFilters,
	UpdatePledgeInput,
} from "../pledge.types";
import {
	PledgeListResult,
	PledgeRepository,
	PledgesReportResult,
	PledgeWithRelations,
} from "../repository/pledge.repository";

@Injectable()
export class PledgeService {
	constructor(private readonly pledgeRepository: PledgeRepository) {}

	async create(data: CreatePledgeInput): Promise<Pledge> {
		return this.pledgeRepository.create(data);
	}

	async getById(tenantId: string, id: string): Promise<PledgeWithRelations> {
		const pledge = await this.pledgeRepository.findById(tenantId, id);
		if (!pledge) {
			throw new NotFoundException(`Pledge not found: ${id}`);
		}
		return pledge;
	}

	async getByIdIncludingDeleted(
		tenantId: string,
		id: string,
	): Promise<PledgeWithRelations> {
		const pledge = await this.pledgeRepository.findByIdIncludingDeleted(
			tenantId,
			id,
		);
		if (!pledge) {
			throw new NotFoundException(`Pledge not found: ${id}`);
		}
		return pledge;
	}

	async getAll(
		tenantId: string,
		filters?: PledgeFilters,
	): Promise<PledgeListResult> {
		return this.pledgeRepository.findAll(tenantId, filters ?? {});
	}

	async getUrgent(
		tenantId: string,
		options: { limit: number; dateFrom?: Date; dateTo?: Date },
	): Promise<PledgeWithRelations[]> {
		return this.pledgeRepository.findUrgent(tenantId, options);
	}

	async getReport(
		tenantId: string,
		options: { dateFrom?: Date; dateTo?: Date } = {},
	): Promise<PledgesReportResult> {
		return this.pledgeRepository.pledgesReport(
			tenantId,
			options.dateFrom,
			options.dateTo,
		);
	}

	async update(
		tenantId: string,
		id: string,
		data: UpdatePledgeInput,
	): Promise<PledgeWithRelations> {
		await this.getById(tenantId, id);
		await this.pledgeRepository.update(tenantId, id, data);
		return this.getById(tenantId, id);
	}

	async delete(
		tenantId: string,
		id: string,
		actorId: string | null,
	): Promise<Pledge> {
		await this.getById(tenantId, id);
		return this.pledgeRepository.softDelete(tenantId, id, actorId);
	}

	async restore(tenantId: string, id: string): Promise<Pledge> {
		await this.getByIdIncludingDeleted(tenantId, id);
		return this.pledgeRepository.restore(tenantId, id);
	}

	async reassignMember(
		tenantId: string,
		fromMemberId: string,
		toMemberId: string,
	): Promise<number> {
		return this.pledgeRepository.reassignMember(
			tenantId,
			fromMemberId,
			toMemberId,
		);
	}

	// Called by TransactionFeatureService on every Tx mutation that touches
	// a pledge (create/update/delete/restore). The repository handles
	// atomicity + the ACTIVE↔FULFILLED auto-transition.
	async adjustPaidAmount(
		tenantId: string,
		id: string,
		delta: number,
	): Promise<Pledge> {
		return this.pledgeRepository.adjustPaidAmount(tenantId, id, delta);
	}

	// Aggregated per-member pledge stats — used by MemberFeatureService.
	async getStatsForMember(tenantId: string, memberId: string) {
		return this.pledgeRepository.statsForMember(tenantId, memberId);
	}
}
