import { CurrentTenant } from "@infrastructure/firebase-auth/decorators/current-tenant.decorator";
import { CurrentUser } from "@infrastructure/firebase-auth/decorators/current-user.decorator";
import { TenantRoles } from "@infrastructure/firebase-auth/decorators/roles.decorator";
import { TenantGuard } from "@infrastructure/firebase-auth/guards/tenant.guard";
import type {
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

import type {
	CreatePledgeRequestDto,
	PledgeFiltersRequestDto,
	UpdatePledgeRequestDto,
} from "../dto/pledge.request.dto";
import {
	PledgeListResponseDto,
	PledgeResponseDto,
} from "../dto/pledge.response.dto";
import type { PledgeFeatureService } from "../services/pledge-feature.service";

@ApiTags("pledges")
@ApiBearerAuth("Bearer")
@ApiParam({ name: "tenantId", description: "Tenant UUID or slug" })
@UseGuards(TenantGuard)
@Controller("tenants/:tenantId/pledges")
export class PledgeController {
	constructor(private readonly pledgeFeatureService: PledgeFeatureService) {}

	@Post()
	@ApiOperation({
		summary: "Create a pledge",
		description:
			"Members can pledge on their own behalf (memberId is ignored and forced to self). Admins can pledge on behalf of any member in the tenant.",
	})
	@ApiCreatedResponse({ type: PledgeResponseDto })
	async create(
		@CurrentUser() user: AuthUser,
		@CurrentTenant() tenant: TenantContext,
		@Body() body: CreatePledgeRequestDto,
	): Promise<PledgeResponseDto> {
		return this.pledgeFeatureService.create(
			user,
			tenant,
			body,
		) as unknown as Promise<PledgeResponseDto>;
	}

	@Get()
	@ApiOperation({
		summary: "List pledges",
		description:
			"Members see only their own; admins and super-admins see all within the tenant.",
	})
	@ApiOkResponse({ type: PledgeListResponseDto })
	async list(
		@CurrentTenant() tenant: TenantContext,
		@Query() filters: PledgeFiltersRequestDto,
	): Promise<PledgeListResponseDto> {
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
	@ApiOperation({ summary: "Get a pledge by id" })
	@ApiOkResponse({ type: PledgeResponseDto })
	async getById(
		@CurrentTenant() tenant: TenantContext,
		@Param("id") id: string,
	): Promise<PledgeResponseDto> {
		return this.pledgeFeatureService.getById(
			tenant,
			id,
		) as unknown as Promise<PledgeResponseDto>;
	}

	@Patch(":id")
	@ApiOperation({ summary: "Update a pledge" })
	@ApiOkResponse({ type: PledgeResponseDto })
	async update(
		@CurrentUser() user: AuthUser,
		@CurrentTenant() tenant: TenantContext,
		@Param("id") id: string,
		@Body() body: UpdatePledgeRequestDto,
	): Promise<PledgeResponseDto> {
		return this.pledgeFeatureService.update(
			user,
			tenant,
			id,
			body,
		) as unknown as Promise<PledgeResponseDto>;
	}

	@TenantRoles("ADMIN")
	@Delete(":id")
	@ApiOperation({ summary: "Soft-delete a pledge (admin only)" })
	@ApiOkResponse({ type: DeleteResponseDto })
	async delete(
		@CurrentUser() user: AuthUser,
		@CurrentTenant() tenant: TenantContext,
		@Param("id") id: string,
	): Promise<DeleteResponseDto> {
		const deleted = await this.pledgeFeatureService.delete(user, tenant, id);
		return { id: deleted.id };
	}
}
