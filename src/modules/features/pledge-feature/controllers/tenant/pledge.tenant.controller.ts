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
	UpdatePledgeRequestDto,
} from "./requests";
import { PledgeListResponseDto, PledgeResponseDto } from "./responses";

// Tenant-management intent for pledges. Available to admins (and
// super-admins, who pass through TenantGuard). Members use the
// /me/pledges endpoint instead.
//
// Authorization is enforced via CASL: assertCan(...) at every method
// confirms the resolved ability permits the action on the resource. The
// controller path itself does not gate by role — the ability factory does.
@ApiTags("pledges (tenant)")
@ApiBearerAuth("Bearer")
@ApiParam({ name: "tenantId", description: "Tenant UUID or slug" })
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
