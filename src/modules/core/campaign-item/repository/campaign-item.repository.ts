import { PrismaClientService } from "@infrastructure/prisma-client/prisma-client.service";
import { Injectable } from "@nestjs/common";
import { CampaignItem, Prisma } from "@prisma/client";
import dayjs from "@shared/dayjs";

import {
	CampaignItemFilters,
	CreateCampaignItemInput,
	UpdateCampaignItemInput,
} from "../campaign-item.types";

@Injectable()
export class CampaignItemRepository {
	constructor(private readonly prisma: PrismaClientService) {}

	async create(data: CreateCampaignItemInput): Promise<CampaignItem> {
		return this.prisma.campaignItem.create({ data });
	}

	async findById(tenantId: string, id: string): Promise<CampaignItem | null> {
		return this.prisma.campaignItem.findFirst({
			where: { id, tenantId, deletedAt: null },
		});
	}

	async findAll(
		tenantId: string,
		filters: CampaignItemFilters,
	): Promise<CampaignItem[]> {
		const where: Prisma.CampaignItemWhereInput = {
			tenantId,
			deletedAt: null,
			...(filters.campaignId ? { campaignId: filters.campaignId } : {}),
		};

		return this.prisma.campaignItem.findMany({
			where,
			orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
		});
	}

	async update(
		_tenantId: string,
		id: string,
		data: UpdateCampaignItemInput,
	): Promise<CampaignItem> {
		return this.prisma.campaignItem.update({ where: { id }, data });
	}

	async softDelete(_tenantId: string, id: string): Promise<CampaignItem> {
		return this.prisma.campaignItem.update({
			where: { id },
			data: { deletedAt: dayjs().toDate() },
		});
	}
}
