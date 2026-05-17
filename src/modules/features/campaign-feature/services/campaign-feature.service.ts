import {
	AuthUser,
	TenantContext,
} from "@infrastructure/firebase-auth/types/auth-user.type";
import { type RestoreCascadeCounts } from "@infrastructure/prisma-client/soft-delete";
import { AuditService } from "@modules/core/audit/services/audit.service";
import { CampaignFilters } from "@modules/core/campaign/campaign.types";
import { CampaignListResult } from "@modules/core/campaign/repository/campaign.repository";
import { CampaignService } from "@modules/core/campaign/services/campaign.service";
import { CampaignItemService } from "@modules/core/campaign-item/services/campaign-item.service";
import { UserService } from "@modules/core/user/services/user.service";
import { BadRequestException, Injectable } from "@nestjs/common";
import {
	AuditAction,
	type Campaign,
	type CampaignItem,
	type CampaignStatus,
} from "@prisma/client";

// Internal create input — controllers translate their HTTP DTOs into this
// shape after authorization has passed.
export interface CreateCampaignServiceInput {
	title: string;
	description?: string;
	deadline?: Date;
	status?: CampaignStatus;
}

export interface UpdateCampaignServiceInput {
	title?: string;
	description?: string;
	deadline?: Date;
	status?: CampaignStatus;
}

export interface CreateCampaignItemServiceInput {
	title: string;
	description?: string;
	targetAmount: number;
	deadline?: Date;
	sortOrder?: number;
}

export interface UpdateCampaignItemServiceInput {
	title?: string;
	description?: string;
	targetAmount?: number;
	deadline?: Date;
	sortOrder?: number;
}

export interface CampaignWithItems extends Campaign {
	items: CampaignItem[];
}

// Per-item progress aggregate — used by the progress endpoint of both
// intents. Lives here as a plain interface because controllers map it
// straight into their per-intent response shape.
export interface CampaignItemProgress {
	itemId: string;
	title: string;
	targetAmount: number;
	pledgedAmount: number;
	raisedAmount: number;
	pledgeCount: number;
}

export interface CampaignProgress {
	campaignId: string;
	goalAmount: number;
	pledgedAmount: number;
	raisedAmount: number;
	pledgeCount: number;
	items: CampaignItemProgress[];
}

@Injectable()
export class CampaignFeatureService {
	constructor(
		private readonly campaignService: CampaignService,
		private readonly campaignItemService: CampaignItemService,
		private readonly userService: UserService,
		private readonly auditService: AuditService,
	) {}

	async create(
		user: AuthUser,
		tenant: TenantContext,
		data: CreateCampaignServiceInput,
	): Promise<Campaign> {
		const campaign = await this.campaignService.create({
			...data,
			tenantId: tenant.tenantId,
			createdBy: user.firebaseUid,
		});
		await this.auditService.record({
			tenantId: tenant.tenantId,
			actorUid: user.firebaseUid,
			actorEmail: user.email,
			action: AuditAction.CREATE,
			entity: "Campaign",
			entityId: campaign.id,
			summary: `Created campaign "${campaign.title}"`,
		});
		return campaign;
	}

	async list(
		tenant: TenantContext,
		filters: CampaignFilters,
	): Promise<CampaignListResult> {
		return this.campaignService.getAll(tenant.tenantId, filters);
	}

	async getById(
		tenant: TenantContext,
		id: string,
		options: { includeDeleted?: boolean; onlyDeleted?: boolean } = {},
	): Promise<CampaignWithItems> {
		const includeTombstones = Boolean(
			options.includeDeleted || options.onlyDeleted,
		);
		const campaign = includeTombstones
			? await this.campaignService.getByIdIncludingDeleted(tenant.tenantId, id)
			: await this.campaignService.getById(tenant.tenantId, id);

		// Items honor the same filter so the "Removed items" section on the
		// campaign detail page can show / hide cascaded tombstones based on
		// the admin's 3-state archive toggle.
		const items = await this.campaignItemService.getAll(tenant.tenantId, {
			campaignId: id,
			includeDeleted: options.includeDeleted,
			onlyDeleted: options.onlyDeleted,
		});
		return { ...campaign, items };
	}

	// Restore-modal preview — only meaningful when the parent has cascaded
	// descendants. The cascade graph in this app only has CampaignItem
	// cascading from Campaign, so this is Campaign-only.
	async getRestorePreview(
		tenant: TenantContext,
		id: string,
	): Promise<RestoreCascadeCounts> {
		return this.campaignService.getRestorePreview(tenant.tenantId, id);
	}

	async update(
		user: AuthUser,
		tenant: TenantContext,
		id: string,
		data: UpdateCampaignServiceInput,
	): Promise<Campaign> {
		const campaign = await this.campaignService.update(
			tenant.tenantId,
			id,
			data,
		);
		await this.auditService.record({
			tenantId: tenant.tenantId,
			actorUid: user.firebaseUid,
			actorEmail: user.email,
			action: AuditAction.UPDATE,
			entity: "Campaign",
			entityId: campaign.id,
			diff: { after: data },
		});
		return campaign;
	}

	async delete(
		user: AuthUser,
		tenant: TenantContext,
		id: string,
	): Promise<Campaign> {
		const actor = await this.userService.findByFirebaseUid(user.firebaseUid);
		const campaign = await this.campaignService.delete(
			tenant.tenantId,
			id,
			actor?.id ?? null,
		);
		await this.auditService.record({
			tenantId: tenant.tenantId,
			actorUid: user.firebaseUid,
			actorEmail: user.email,
			action: AuditAction.DELETE,
			entity: "Campaign",
			entityId: campaign.id,
		});
		return campaign;
	}

	async restore(
		user: AuthUser,
		tenant: TenantContext,
		id: string,
	): Promise<Campaign> {
		const campaign = await this.campaignService.restore(tenant.tenantId, id);
		await this.auditService.record({
			tenantId: tenant.tenantId,
			actorUid: user.firebaseUid,
			actorEmail: user.email,
			action: AuditAction.RESTORE,
			entity: "Campaign",
			entityId: campaign.id,
		});
		return campaign;
	}

	async addItem(
		tenant: TenantContext,
		campaignId: string,
		data: CreateCampaignItemServiceInput,
	): Promise<CampaignItem> {
		await this.campaignService.getById(tenant.tenantId, campaignId);
		return this.campaignItemService.create({
			...data,
			tenantId: tenant.tenantId,
			campaignId,
		});
	}

	async updateItem(
		tenant: TenantContext,
		campaignId: string,
		itemId: string,
		data: UpdateCampaignItemServiceInput,
	): Promise<CampaignItem> {
		const item = await this.campaignItemService.getById(
			tenant.tenantId,
			itemId,
		);
		if (item.campaignId !== campaignId) {
			throw new BadRequestException("Item does not belong to this campaign");
		}
		return this.campaignItemService.update(tenant.tenantId, itemId, data);
	}

	async deleteItem(
		user: AuthUser,
		tenant: TenantContext,
		campaignId: string,
		itemId: string,
	): Promise<CampaignItem> {
		const item = await this.campaignItemService.getById(
			tenant.tenantId,
			itemId,
		);
		if (item.campaignId !== campaignId) {
			throw new BadRequestException("Item does not belong to this campaign");
		}
		const actor = await this.userService.findByFirebaseUid(user.firebaseUid);
		return this.campaignItemService.delete(
			tenant.tenantId,
			itemId,
			actor?.id ?? null,
		);
	}

	async restoreItem(
		user: AuthUser,
		tenant: TenantContext,
		campaignId: string,
		itemId: string,
	): Promise<CampaignItem> {
		const item = await this.campaignItemService.getByIdIncludingDeleted(
			tenant.tenantId,
			itemId,
		);
		if (item.campaignId !== campaignId) {
			throw new BadRequestException("Item does not belong to this campaign");
		}
		const restored = await this.campaignItemService.restore(
			tenant.tenantId,
			itemId,
		);
		await this.auditService.record({
			tenantId: tenant.tenantId,
			actorUid: user.firebaseUid,
			actorEmail: user.email,
			action: AuditAction.RESTORE,
			entity: "CampaignItem",
			entityId: restored.id,
		});
		return restored;
	}

	// Per-campaign progress summary: goal (sum of items), pledged totals,
	// raised totals (transactions), and a per-item breakdown.
	async progress(
		tenant: TenantContext,
		campaignId: string,
	): Promise<CampaignProgress> {
		const { items } = await this.getById(tenant, campaignId);
		const aggregates = await this.campaignService.getProgress(
			tenant.tenantId,
			campaignId,
		);

		const pledgesByItem = new Map(
			aggregates.byItemPledges.map((r) => [r.itemId, r]),
		);
		const txByItem = new Map(
			aggregates.byItemTransactions.map((r) => [r.itemId, r]),
		);

		const itemProgress: CampaignItemProgress[] = items.map((item) => ({
			itemId: item.id,
			title: item.title,
			targetAmount: Number(item.targetAmount),
			pledgedAmount: Number(pledgesByItem.get(item.id)?.pledgedAmount ?? 0),
			raisedAmount: Number(txByItem.get(item.id)?.raisedAmount ?? 0),
			pledgeCount: pledgesByItem.get(item.id)?.pledgeCount ?? 0,
		}));

		const goalAmount = items.reduce(
			(sum, it) => sum + Number(it.targetAmount),
			0,
		);

		return {
			campaignId,
			goalAmount,
			pledgedAmount: aggregates.pledgedAmount,
			raisedAmount: aggregates.raisedAmount,
			pledgeCount: aggregates.pledgeCount,
			items: itemProgress,
		};
	}
}
