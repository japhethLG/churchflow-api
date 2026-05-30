import {
	type AppAbility,
	asSubject,
	assertCan,
	CurrentAbility,
} from "@infrastructure/authorization";
import { CurrentTenant } from "@infrastructure/firebase-auth/decorators/current-tenant.decorator";
import { TenantGuard } from "@infrastructure/firebase-auth/guards/tenant.guard";
import { TenantContext } from "@infrastructure/firebase-auth/types/auth-user.type";
import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import {
	ApiBearerAuth,
	ApiOkResponse,
	ApiOperation,
	ApiParam,
	ApiQuery,
	ApiTags,
} from "@nestjs/swagger";

import { CampaignFeatureService } from "../../services/campaign-feature.service";
import {
	MyCampaignFiltersRequestDto,
	MyCampaignProgressBatchRequestDto,
} from "./requests";
import {
	MyCampaignListResponseDto,
	MyCampaignProgressBatchResponseDto,
	MyCampaignProgressResponseDto,
	MyCampaignResponseDto,
	MyCampaignWithItemsResponseDto,
} from "./responses";

// Self-service intent for campaigns. Read-only — campaigns are tenant-
// wide and visible to every member, but only admins can mutate them
// (those routes live on the tenant controller).
@ApiTags("campaigns (self)")
@ApiBearerAuth("Bearer")
@ApiParam({
	name: "tenantId",
	type: String,
	description: "Tenant UUID or slug",
})
@UseGuards(TenantGuard)
@Controller("tenants/:tenantId/me/campaigns")
export class CampaignSelfController {
	constructor(
		private readonly campaignFeatureService: CampaignFeatureService,
	) {}

	@Get()
	@ApiOperation({
		summary: "List campaigns visible to the authenticated member",
	})
	@ApiOkResponse({ type: MyCampaignListResponseDto })
	async list(
		@CurrentTenant() tenant: TenantContext,
		@CurrentAbility() ability: AppAbility,
		@Query() filters: MyCampaignFiltersRequestDto,
	): Promise<MyCampaignListResponseDto> {
		assertCan(ability, "read", "Campaign");
		const result = await this.campaignFeatureService.list(tenant, filters);
		return {
			items: result.items as unknown as MyCampaignResponseDto[],
			meta: {
				offset: filters.offset ?? 0,
				limit: filters.limit ?? result.items.length,
				total: result.total,
			},
		};
	}

	// Batch progress lookup, mirroring the tenant controller's
	// progress/batch. Static path declared before ":id" so Nest doesn't
	// treat "progress" as a campaign id. Replaces the member dashboard /
	// campaigns-list fan-out of N individual /progress calls.
	@Get("progress/batch")
	@ApiOperation({
		summary: "Batch campaign progress (member view)",
		description:
			"Returns one entry per requested campaign id. Replaces the FE's fan-out of N individual /me/campaigns/:id/progress calls when rendering many progress bars.",
	})
	@ApiQuery({
		name: "ids",
		required: true,
		type: String,
		description: "Comma-separated campaign IDs. Max 100.",
	})
	@ApiOkResponse({ type: MyCampaignProgressBatchResponseDto })
	async progressBatch(
		@CurrentTenant() tenant: TenantContext,
		@CurrentAbility() ability: AppAbility,
		@Query() query: MyCampaignProgressBatchRequestDto,
	): Promise<MyCampaignProgressBatchResponseDto> {
		assertCan(ability, "read", "Campaign");
		const items = await this.campaignFeatureService.progressMany(
			tenant,
			query.ids,
		);
		return { items };
	}

	@Get(":id")
	@ApiOperation({ summary: "Get a campaign with its items (member view)" })
	@ApiQuery({
		name: "includeDeleted",
		required: false,
		type: Boolean,
		description:
			"Include the campaign and its items even if archived. Members navigate to a deleted campaign from a pledge/transaction reference to render the read-only banner.",
	})
	@ApiOkResponse({ type: MyCampaignWithItemsResponseDto })
	async getById(
		@CurrentTenant() tenant: TenantContext,
		@CurrentAbility() ability: AppAbility,
		@Param("id") id: string,
		@Query("includeDeleted") includeDeleted?: boolean,
	): Promise<MyCampaignWithItemsResponseDto> {
		const campaign = await this.campaignFeatureService.getById(tenant, id, {
			includeDeleted,
		});
		assertCan(ability, "read", asSubject("Campaign", campaign));
		return campaign as unknown as MyCampaignWithItemsResponseDto;
	}

	@Get(":id/progress")
	@ApiOperation({ summary: "Campaign progress (member view)" })
	@ApiOkResponse({ type: MyCampaignProgressResponseDto })
	async progress(
		@CurrentTenant() tenant: TenantContext,
		@CurrentAbility() ability: AppAbility,
		@Param("id") id: string,
	): Promise<MyCampaignProgressResponseDto> {
		const campaign = await this.campaignFeatureService.getById(tenant, id);
		assertCan(ability, "read", asSubject("Campaign", campaign));
		return this.campaignFeatureService.progress(tenant, id);
	}
}
