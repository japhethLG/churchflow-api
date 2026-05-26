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
	ApiQuery,
	ApiTags,
} from "@nestjs/swagger";
import { DeleteResponseDto } from "@shared/dto/delete-response.dto";

import { PledgeFeatureService } from "../../services/pledge-feature.service";
import {
	CreatePledgeRequestDto,
	PledgeFiltersRequestDto,
	PledgesReportQueryRequestDto,
	UpdatePledgeRequestDto,
	UrgentPledgesQueryRequestDto,
} from "./requests";
import {
	PledgeListResponseDto,
	PledgeResponseDto,
	PledgesReportResponseDto,
} from "./responses";

// Tenant-management intent for pledges. Available to admins (and
// super-admins, who pass through TenantGuard). Members use the
// /me/pledges endpoint instead.
//
// Authorization is enforced via CASL: assertCan(...) at every method
// confirms the resolved ability permits the action on the resource. The
// controller path itself does not gate by role — the ability factory does.
@ApiTags("pledges (tenant)")
@ApiBearerAuth("Bearer")
@ApiParam({
	name: "tenantId",
	type: String,
	description: "Tenant UUID or slug",
})
@UseGuards(TenantGuard)
@Controller("tenants/:tenantId/pledges")
export class PledgeTenantController {
	constructor(private readonly pledgeFeatureService: PledgeFeatureService) {}

	@Post()
	@ApiOperation({
		summary: "Create a pledge on behalf of a member (admin only)",
		description: "Admin can pledge for any member in the tenant.",
	})
	@ApiCreatedResponse({ type: PledgeResponseDto })
	async create(
		@CurrentUser() user: AuthUser,
		@CurrentTenant() tenant: TenantContext,
		@CurrentAbility() ability: AppAbility,
		@Body() body: CreatePledgeRequestDto,
	): Promise<PledgeResponseDto> {
		assertCan(
			ability,
			"create",
			asSubject("Pledge", { memberId: body.memberId }),
		);
		return this.pledgeFeatureService.create(
			user,
			tenant,
			body,
		) as unknown as Promise<PledgeResponseDto>;
	}

	@Get()
	@ApiOperation({
		summary: "List pledges across the tenant (admin only)",
	})
	@ApiOkResponse({ type: PledgeListResponseDto })
	async list(
		@CurrentTenant() tenant: TenantContext,
		@CurrentAbility() ability: AppAbility,
		@Query() filters: PledgeFiltersRequestDto,
	): Promise<PledgeListResponseDto> {
		assertCan(ability, "read", "Pledge");
		const result = await this.pledgeFeatureService.list(tenant, filters);
		return {
			items: result.items as unknown as PledgeResponseDto[],
			meta: {
				offset: filters.offset ?? 0,
				limit: filters.limit ?? result.items.length,
				total: result.total,
				sum: result.sum,
			},
		};
	}

	// Static "urgent" segment must be declared before the ":id" routes below
	// or Nest's matcher would treat "urgent" as an id.
	@Get("urgent")
	@ApiOperation({
		summary:
			"List the most urgent active pledges (admin dashboard outstanding card)",
		description:
			"Returns active pledges that are past-due, due-soon (≤14d), or on-track within 30 days of their resolved deadline, sorted by urgency. Auto-fulfilled and no-deadline pledges are excluded.",
	})
	@ApiOkResponse({ type: PledgeListResponseDto })
	async urgent(
		@CurrentTenant() tenant: TenantContext,
		@CurrentAbility() ability: AppAbility,
		@Query() query: UrgentPledgesQueryRequestDto,
	): Promise<PledgeListResponseDto> {
		assertCan(ability, "read", "Pledge");
		const limit = query.limit ?? 50;
		const items = await this.pledgeFeatureService.urgent(tenant, {
			limit,
			dateFrom: query.dateFrom,
			dateTo: query.dateTo,
		});
		const sum = items.reduce((acc, p) => acc + Number(p.pledgedAmount), 0);
		return {
			items: items as unknown as PledgeResponseDto[],
			meta: {
				offset: 0,
				limit,
				total: items.length,
				sum,
			},
		};
	}

	// Cohort-style pledge report. Static "reports/dynamics" segment must
	// be declared before the ":id" routes below or Nest's matcher would
	// treat "reports" as an id.
	@Get("reports/dynamics")
	@ApiOperation({
		summary: "Pledge dynamics report (admin Reports → Pledge Dynamics tab)",
		description:
			"Cohort-style: of pledges whose `createdAt` falls in the date range, returns totals, fulfillment %, status breakdown, and aging buckets.",
	})
	@ApiOkResponse({ type: PledgesReportResponseDto })
	async dynamicsReport(
		@CurrentTenant() tenant: TenantContext,
		@CurrentAbility() ability: AppAbility,
		@Query() query: PledgesReportQueryRequestDto,
	): Promise<PledgesReportResponseDto> {
		assertCan(ability, "read", "Pledge");
		return this.pledgeFeatureService.report(tenant, {
			dateFrom: query.dateFrom,
			dateTo: query.dateTo,
		}) as unknown as Promise<PledgesReportResponseDto>;
	}

	@Get(":id")
	@ApiOperation({ summary: "Get a pledge by id (admin only)" })
	@ApiQuery({
		name: "includeDeleted",
		required: false,
		type: Boolean,
		description:
			"Return the pledge even if soft-deleted (banner-style archived view).",
	})
	@ApiOkResponse({ type: PledgeResponseDto })
	async getById(
		@CurrentTenant() tenant: TenantContext,
		@CurrentAbility() ability: AppAbility,
		@Param("id") id: string,
		@Query("includeDeleted") includeDeleted?: boolean,
	): Promise<PledgeResponseDto> {
		const pledge = await this.pledgeFeatureService.getById(tenant, id, {
			includeDeleted,
		});
		assertCan(ability, "read", asSubject("Pledge", pledge));
		return pledge as unknown as PledgeResponseDto;
	}

	@Patch(":id")
	@ApiOperation({ summary: "Update a pledge (admin only)" })
	@ApiOkResponse({ type: PledgeResponseDto })
	async update(
		@CurrentUser() user: AuthUser,
		@CurrentTenant() tenant: TenantContext,
		@CurrentAbility() ability: AppAbility,
		@Param("id") id: string,
		@Body() body: UpdatePledgeRequestDto,
	): Promise<PledgeResponseDto> {
		const existing = await this.pledgeFeatureService.getById(tenant, id);
		assertCan(ability, "update", asSubject("Pledge", existing));
		return this.pledgeFeatureService.update(
			user,
			tenant,
			id,
			body,
		) as unknown as Promise<PledgeResponseDto>;
	}

	@Delete(":id")
	@ApiOperation({ summary: "Soft-delete a pledge (admin only)" })
	@ApiOkResponse({ type: DeleteResponseDto })
	async delete(
		@CurrentUser() user: AuthUser,
		@CurrentTenant() tenant: TenantContext,
		@CurrentAbility() ability: AppAbility,
		@Param("id") id: string,
	): Promise<DeleteResponseDto> {
		const existing = await this.pledgeFeatureService.getById(tenant, id);
		assertCan(ability, "delete", asSubject("Pledge", existing));
		const deleted = await this.pledgeFeatureService.delete(user, tenant, id);
		return { id: deleted.id };
	}

	@Post(":id/restore")
	@ApiOperation({ summary: "Restore a soft-deleted pledge (admin only)" })
	@ApiOkResponse({ type: PledgeResponseDto })
	async restore(
		@CurrentUser() user: AuthUser,
		@CurrentTenant() tenant: TenantContext,
		@CurrentAbility() ability: AppAbility,
		@Param("id") id: string,
	): Promise<PledgeResponseDto> {
		assertCan(ability, "restore", "Pledge");
		return this.pledgeFeatureService.restore(
			user,
			tenant,
			id,
		) as unknown as Promise<PledgeResponseDto>;
	}
}
