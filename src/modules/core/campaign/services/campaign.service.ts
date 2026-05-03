import { Injectable, NotFoundException } from "@nestjs/common";

import { Campaign } from "@prisma/client";

import {
	CampaignFilters,
	CreateCampaignInput,
	UpdateCampaignInput,
} from "../campaign.types";
import {
	CampaignListResult,
	CampaignRepository,
} from "../repository/campaign.repository";

@Injectable()
export class CampaignService {
	constructor(private readonly campaignRepository: CampaignRepository) {}

	async create(data: CreateCampaignInput): Promise<Campaign> {
		return this.campaignRepository.create(data);
	}

	async getById(tenantId: string, id: string): Promise<Campaign> {
		const campaign = await this.campaignRepository.findById(tenantId, id);
		if (!campaign) {
			throw new NotFoundException(`Campaign not found: ${id}`);
		}
		return campaign;
	}

	async getAll(
		tenantId: string,
		filters?: CampaignFilters,
	): Promise<CampaignListResult> {
		return this.campaignRepository.findAll(tenantId, filters ?? {});
	}

	async update(
		tenantId: string,
		id: string,
		data: UpdateCampaignInput,
	): Promise<Campaign> {
		await this.getById(tenantId, id);
		return this.campaignRepository.update(tenantId, id, data);
	}

	async delete(tenantId: string, id: string): Promise<Campaign> {
		await this.getById(tenantId, id);
		return this.campaignRepository.softDelete(tenantId, id);
	}

	async restore(tenantId: string, id: string): Promise<Campaign> {
		const existing = await this.campaignRepository.findByIdIncludingDeleted(
			tenantId,
			id,
		);
		if (!existing) {
			throw new NotFoundException(`Campaign not found: ${id}`);
		}
		return this.campaignRepository.restore(tenantId, id);
	}

	async getProgress(tenantId: string, id: string) {
		await this.getById(tenantId, id);
		return this.campaignRepository.progress(tenantId, id);
	}
}
