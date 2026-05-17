import { PrismaClientService } from "@infrastructure/prisma-client/prisma-client.service";
import {
	applyStateFilter,
	restore,
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

	async findByIdIncludingDeleted(
		tenantId: string,
		id: string,
	): Promise<CampaignItem | null> {
		return this.prisma.campaignItem.findFirst(
			withDeleted("CampaignItem", { where: { id, tenantId } }),
		);
	}

	async findAll(
		tenantId: string,
		filters: CampaignItemFilters,
	): Promise<CampaignItem[]> {
		const baseWhere: Prisma.CampaignItemWhereInput = {
			tenantId,
			...(filters.campaignId ? { campaignId: filters.campaignId } : {}),
		};
		const { where, wrap } = applyStateFilter(
			"CampaignItem",
			baseWhere,
			filters,
		);
		return this.prisma.campaignItem.findMany(
			wrap({
				where,
				orderBy: [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }],
			}),
		);
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

	async restore(tenantId: string, id: string): Promise<CampaignItem> {
		return this.prisma.$transaction(async (tx) => {
			await restore(tx, "CampaignItem", { where: { id, tenantId } });
			return tx.campaignItem.findFirstOrThrow({ where: { id, tenantId } });
		});
	}
}
