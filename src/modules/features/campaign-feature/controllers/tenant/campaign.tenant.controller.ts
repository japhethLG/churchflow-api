import {
	type AppAbility,
	asSubject,
	assertCan,
	CurrentAbility,
} from "@infrastructure/authorization";
import { CurrentTenant } from "@infrastructure/firebase-auth/decorators/current-tenant.decorator";
import { CurrentUser } from "@infrastructure/firebase-auth/decorators/current-user.decorator";
import { TenantGuard } from "@infrastructure/firebase-auth/guards/tenant.guard";
import {
	AuthUser,
	TenantContext,
} from "@infrastructure/firebase-auth/types/auth-user.type";
import {
	Body,
	Controller,
	Delete,
	Get,
	Param,
	Patch,
	Post,
	Query,
	UseGuards,
} from "@nestjs/common";
import {
	ApiBearerAuth,
	ApiCreatedResponse,
	ApiOkResponse,
	ApiOperation,
	ApiParam,
	ApiTags,
} from "@nestjs/swagger";
import { DeleteResponseDto } from "@shared/dto/delete-response.dto";

import { CampaignFeatureService } from "../../services/campaign-feature.service";
import {
	CampaignFiltersRequestDto,
	CreateCampaignItemRequestDto,
	CreateCampaignRequestDto,
	UpdateCampaignItemRequestDto,
	UpdateCampaignRequestDto,
} from "./requests";
import {
	CampaignItemResponseDto,
	CampaignListResponseDto,
	CampaignProgressResponseDto,
	CampaignResponseDto,
	CampaignWithItemsResponseDto,
} from "./responses";

// Tenant-management intent for campaigns. Admins create / edit / delete
// campaigns and their items here. Members view campaigns through
// /me/campaigns instead — those are read-only and reflect the same data.
@ApiTags("campaigns (tenant)")
@ApiBearerAuth("Bearer")
@ApiParam({ name: "tenantId", description: "Tenant UUID or slug" })
@UseGuards(TenantGuard)
@Controller("tenants/:tenantId/campaigns")
export class CampaignTenantController {
	constructor(
		private readonly campaignFeatureService: CampaignFeatureService,
	) {}

	@Post()
	@ApiOperation({ summary: "Create a campaign (admin only)" })
	@ApiCreatedResponse({ type: CampaignResponseDto })
	async create(
		@CurrentUser() user: AuthUser,
		@CurrentTenant() tenant: TenantContext,
		@CurrentAbility() ability: AppAbility,
		@Body() body: CreateCampaignRequestDto,
	): Promise<CampaignResponseDto> {
		assertCan(ability, "create", "Campaign");
		return this.campaignFeatureService.create(
			user,
			tenant,
			body,
		) as unknown as Promise<CampaignResponseDto>;
	}

	@Get()
	@ApiOperation({ summary: "List campaigns (admin)" })
	@ApiOkResponse({ type: CampaignListResponseDto })
	async list(
		@CurrentTenant() tenant: TenantContext,
		@CurrentAbility() ability: AppAbility,
		@Query() filters: CampaignFiltersRequestDto,
	): Promise<CampaignListResponseDto> {
		assertCan(ability, "read", "Campaign");
		const result = await this.campaignFeatureService.list(tenant, filters);
		return {
			items: result.items as unknown as CampaignResponseDto[],
			meta: {
				offset: filters.offset ?? 0,
				limit: filters.limit ?? result.items.length,
				total: result.total,
			},
		};
	}

	@Get(":id")
	@ApiOperation({ summary: "Get a campaign with its items (admin)" })
	@ApiOkResponse({ type: CampaignWithItemsResponseDto })
	async getById(
		@CurrentTenant() tenant: TenantContext,
		@CurrentAbility() ability: AppAbility,
		@Param("id") id: string,
	): Promise<CampaignWithItemsResponseDto> {
		const campaign = await this.campaignFeatureService.getById(tenant, id);
		assertCan(ability, "read", asSubject("Campaign", campaign));
		return campaign as unknown as CampaignWithItemsResponseDto;
	}

	@Get(":id/progress")
	@ApiOperation({
		summary: "Campaign progress (goal / pledged / raised) — admin",
	})
	@ApiOkResponse({ type: CampaignProgressResponseDto })
	async progress(
		@CurrentTenant() tenant: TenantContext,
		@CurrentAbility() ability: AppAbility,
		@Param("id") id: string,
	): Promise<CampaignProgressResponseDto> {
		const campaign = await this.campaignFeatureService.getById(tenant, id);
		assertCan(ability, "read", asSubject("Campaign", campaign));
		return this.campaignFeatureService.progress(tenant, id);
	}

	@Patch(":id")
	@ApiOperation({ summary: "Update a campaign (admin only)" })
	@ApiOkResponse({ type: CampaignResponseDto })
	async update(
		@CurrentUser() user: AuthUser,
		@CurrentTenant() tenant: TenantContext,
		@CurrentAbility() ability: AppAbility,
		@Param("id") id: string,
		@Body() body: UpdateCampaignRequestDto,
	): Promise<CampaignResponseDto> {
		const existing = await this.campaignFeatureService.getById(tenant, id);
		assertCan(ability, "update", asSubject("Campaign", existing));
		return this.campaignFeatureService.update(
			user,
			tenant,
			id,
			body,
		) as unknown as Promise<CampaignResponseDto>;
	}

	@Delete(":id")
	@ApiOperation({ summary: "Soft-delete a campaign (admin only)" })
	@ApiOkResponse({ type: DeleteResponseDto })
	async delete(
		@CurrentUser() user: AuthUser,
		@CurrentTenant() tenant: TenantContext,
		@CurrentAbility() ability: AppAbility,
		@Param("id") id: string,
	): Promise<DeleteResponseDto> {
		const existing = await this.campaignFeatureService.getById(tenant, id);
		assertCan(ability, "delete", asSubject("Campaign", existing));
		const deleted = await this.campaignFeatureService.delete(user, tenant, id);
		return { id: deleted.id };
	}

	@Post(":id/restore")
	@ApiOperation({ summary: "Restore a soft-deleted campaign (admin only)" })
	@ApiOkResponse({ type: CampaignResponseDto })
	async restore(
		@CurrentUser() user: AuthUser,
		@CurrentTenant() tenant: TenantContext,
		@CurrentAbility() ability: AppAbility,
		@Param("id") id: string,
	): Promise<CampaignResponseDto> {
		assertCan(ability, "update", "Campaign");
		return this.campaignFeatureService.restore(
			user,
			tenant,
			id,
		) as unknown as Promise<CampaignResponseDto>;
	}

	@Post(":id/items")
	@ApiOperation({ summary: "Add a breakdown item to a campaign (admin only)" })
	@ApiCreatedResponse({ type: CampaignItemResponseDto })
	async addItem(
		@CurrentTenant() tenant: TenantContext,
		@CurrentAbility() ability: AppAbility,
		@Param("id") campaignId: string,
		@Body() body: CreateCampaignItemRequestDto,
	): Promise<CampaignItemResponseDto> {
		assertCan(ability, "create", "CampaignItem");
		return this.campaignFeatureService.addItem(
			tenant,
			campaignId,
			body,
		) as unknown as Promise<CampaignItemResponseDto>;
	}

	@Patch(":id/items/:itemId")
	@ApiOperation({ summary: "Update a campaign item (admin only)" })
	@ApiOkResponse({ type: CampaignItemResponseDto })
	async updateItem(
		@CurrentTenant() tenant: TenantContext,
		@CurrentAbility() ability: AppAbility,
		@Param("id") campaignId: string,
		@Param("itemId") itemId: string,
		@Body() body: UpdateCampaignItemRequestDto,
	): Promise<CampaignItemResponseDto> {
		assertCan(ability, "update", "CampaignItem");
		return this.campaignFeatureService.updateItem(
			tenant,
			campaignId,
			itemId,
			body,
		) as unknown as Promise<CampaignItemResponseDto>;
	}

	@Delete(":id/items/:itemId")
	@ApiOperation({ summary: "Soft-delete a campaign item (admin only)" })
	@ApiOkResponse({ type: DeleteResponseDto })
	async deleteItem(
		@CurrentTenant() tenant: TenantContext,
		@CurrentAbility() ability: AppAbility,
		@Param("id") campaignId: string,
		@Param("itemId") itemId: string,
	): Promise<DeleteResponseDto> {
		assertCan(ability, "delete", "CampaignItem");
		const deleted = await this.campaignFeatureService.deleteItem(
			tenant,
			campaignId,
			itemId,
		);
		return { id: deleted.id };
	}
}
