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
	PledgeWithAmounts,
} from "../repository/pledge.repository";

@Injectable()
export class PledgeService {
	constructor(private readonly pledgeRepository: PledgeRepository) {}

	async create(data: CreatePledgeInput): Promise<Pledge> {
		return this.pledgeRepository.create(data);
	}

	async getById(tenantId: string, id: string): Promise<PledgeWithAmounts> {
		const pledge = await this.pledgeRepository.findById(tenantId, id);
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

	async update(
		tenantId: string,
		id: string,
		data: UpdatePledgeInput,
	): Promise<PledgeWithAmounts> {
		await this.getById(tenantId, id);
		await this.pledgeRepository.update(tenantId, id, data);
		return this.getById(tenantId, id);
	}

	async delete(tenantId: string, id: string): Promise<Pledge> {
		await this.getById(tenantId, id);
		return this.pledgeRepository.softDelete(tenantId, id);
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
}
