import { PrismaClientService } from "@infrastructure/prisma-client/prisma-client.service";
import {
	softDelete,
	withDeleted,
} from "@infrastructure/prisma-client/soft-delete";
import { Injectable } from "@nestjs/common";
import { CampaignItem, Prisma } from "@prisma/client";

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
			where: { id, tenantId },
		});
	}

	async findAll(
		tenantId: string,
		filters: CampaignItemFilters,
	): Promise<CampaignItem[]> {
		const where: Prisma.CampaignItemWhereInput = {
			tenantId,
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

	async softDelete(
		tenantId: string,
		id: string,
		actorId: string | null,
	): Promise<CampaignItem> {
		return this.prisma.$transaction(async (tx) => {
			await softDelete(tx, "CampaignItem", {
				where: { id, tenantId },
				actorId,
			});
			return tx.campaignItem.findFirstOrThrow(
				withDeleted("CampaignItem", { where: { id, tenantId } }),
			);
		});
	}
}
