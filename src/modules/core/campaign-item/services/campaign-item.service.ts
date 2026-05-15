import { Injectable, NotFoundException } from "@nestjs/common";

import { CampaignItem } from "@prisma/client";

import {
	CampaignItemFilters,
	CreateCampaignItemInput,
	UpdateCampaignItemInput,
} from "../campaign-item.types";
import { CampaignItemRepository } from "../repository/campaign-item.repository";

@Injectable()
export class CampaignItemService {
	constructor(private readonly repository: CampaignItemRepository) {}

	async create(data: CreateCampaignItemInput): Promise<CampaignItem> {
		return this.repository.create(data);
	}

	async getById(tenantId: string, id: string): Promise<CampaignItem> {
		const item = await this.repository.findById(tenantId, id);
		if (!item) {
			throw new NotFoundException(`Campaign item not found: ${id}`);
		}
		return item;
	}

	async getAll(
		tenantId: string,
		filters?: CampaignItemFilters,
	): Promise<CampaignItem[]> {
		return this.repository.findAll(tenantId, filters ?? {});
	}

	async update(
		tenantId: string,
		id: string,
		data: UpdateCampaignItemInput,
	): Promise<CampaignItem> {
		await this.getById(tenantId, id);
		return this.repository.update(tenantId, id, data);
	}

	async delete(
		tenantId: string,
		id: string,
		actorId: string | null,
	): Promise<CampaignItem> {
		await this.getById(tenantId, id);
		return this.repository.softDelete(tenantId, id, actorId);
	}
}
