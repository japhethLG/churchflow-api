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
	Get,
	NotFoundException,
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

import { PledgeFeatureService } from "../../services/pledge-feature.service";
import {
	CreateMyPledgeRequestDto,
	MyPledgeFiltersRequestDto,
	UpdateMyPledgeRequestDto,
} from "./requests";
import { MyPledgeListResponseDto, MyPledgeResponseDto } from "./responses";

// Self-service intent for pledges. The URL prefix `/me/` declares that
// every operation is scoped to the authenticated caller, regardless of
// role. An ADMIN visiting their own member dashboard hits these routes
// and only sees their own pledges, not the church's books.
//
// memberId is forced to `tenant.memberId` at every entry point — the
// request DTOs do not even accept it. CASL still validates as
// defense-in-depth.
@ApiTags("pledges (self)")
@ApiBearerAuth("Bearer")
@ApiParam({ name: "tenantId", description: "Tenant UUID or slug" })
@UseGuards(TenantGuard)
@Controller("tenants/:tenantId/me/pledges")
export class PledgeSelfController {
	constructor(private readonly pledgeFeatureService: PledgeFeatureService) {}

	@Post()
	@ApiOperation({ summary: "Pledge on behalf of the authenticated member" })
	@ApiCreatedResponse({ type: MyPledgeResponseDto })
	async create(
		@CurrentUser() user: AuthUser,
		@CurrentTenant() tenant: TenantContext,
		@CurrentAbility() ability: AppAbility,
		@Body() body: CreateMyPledgeRequestDto,
	): Promise<MyPledgeResponseDto> {
		const memberId = this.requireMemberContext(tenant);
		assertCan(ability, "create", asSubject("Pledge", { memberId }));
		return this.pledgeFeatureService.create(user, tenant, {
			...body,
			memberId,
		}) as unknown as Promise<MyPledgeResponseDto>;
	}

	@Get()
	@ApiOperation({ summary: "List the authenticated member's own pledges" })
	@ApiOkResponse({ type: MyPledgeListResponseDto })
	async list(
		@CurrentTenant() tenant: TenantContext,
		@CurrentAbility() ability: AppAbility,
		@Query() filters: MyPledgeFiltersRequestDto,
	): Promise<MyPledgeListResponseDto> {
		const memberId = this.requireMemberContext(tenant);
		assertCan(ability, "read", asSubject("Pledge", { memberId }));
		const result = await this.pledgeFeatureService.list(tenant, {
			...filters,
			memberId,
		});
		return {
			items: result.items as unknown as MyPledgeResponseDto[],
			meta: {
				offset: filters.offset ?? 0,
				limit: filters.limit ?? result.items.length,
				total: result.total,
				sum: result.sum,
			},
		};
	}

	@Get(":id")
	@ApiOperation({
		summary: "Get one of the authenticated member's own pledges",
	})
	@ApiOkResponse({ type: MyPledgeResponseDto })
	async getById(
		@CurrentTenant() tenant: TenantContext,
		@CurrentAbility() ability: AppAbility,
		@Param("id") id: string,
	): Promise<MyPledgeResponseDto> {
		this.requireMemberContext(tenant);
		const pledge = await this.pledgeFeatureService.getById(tenant, id);
		assertCan(ability, "read", asSubject("Pledge", pledge));
		return pledge as unknown as MyPledgeResponseDto;
	}

	@Patch(":id")
	@ApiOperation({ summary: "Update one of the authenticated member's pledges" })
	@ApiOkResponse({ type: MyPledgeResponseDto })
	async update(
		@CurrentUser() user: AuthUser,
		@CurrentTenant() tenant: TenantContext,
		@CurrentAbility() ability: AppAbility,
		@Param("id") id: string,
		@Body() body: UpdateMyPledgeRequestDto,
	): Promise<MyPledgeResponseDto> {
		this.requireMemberContext(tenant);
		const existing = await this.pledgeFeatureService.getById(tenant, id);
		assertCan(ability, "update", asSubject("Pledge", existing));
		return this.pledgeFeatureService.update(
			user,
			tenant,
			id,
			body,
		) as unknown as Promise<MyPledgeResponseDto>;
	}

	private requireMemberContext(tenant: TenantContext): string {
		if (!tenant.memberId) {
			throw new NotFoundException(
				"No member context for the authenticated user in this tenant",
			);
		}
		return tenant.memberId;
	}
}
