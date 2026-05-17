import { type RestoreCascadeCounts } from "@infrastructure/prisma-client/soft-delete";
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

	// Fetch by id including tombstones. Used by archived-detail pages and by
	// member-side navigation to deleted referenced entities (Mode B click-
	// through). NotFound only when the id genuinely has no row at all.
	async getByIdIncludingDeleted(
		tenantId: string,
		id: string,
	): Promise<Campaign> {
		const campaign = await this.campaignRepository.findByIdIncludingDeleted(
			tenantId,
			id,
		);
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

	async delete(
		tenantId: string,
		id: string,
		actorId: string | null,
	): Promise<Campaign> {
		await this.getById(tenantId, id);
		return this.campaignRepository.softDelete(tenantId, id, actorId);
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

	// Cascade preview for the restore confirmation modal. Uses the
	// including-deleted lookup so an admin opening the modal on an archived
	// campaign doesn't get a 404.
	async getRestorePreview(
		tenantId: string,
		id: string,
	): Promise<RestoreCascadeCounts> {
		await this.getByIdIncludingDeleted(tenantId, id);
		return this.campaignRepository.restorePreview(tenantId, id);
	}
}
