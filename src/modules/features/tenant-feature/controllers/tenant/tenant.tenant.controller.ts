import {
	type AppAbility,
	asSubject,
	assertCan,
	CurrentAbility,
} from "@infrastructure/authorization";
import { CurrentUser } from "@infrastructure/firebase-auth/decorators/current-user.decorator";
import { TenantGuard } from "@infrastructure/firebase-auth/guards/tenant.guard";
import { AuthUser } from "@infrastructure/firebase-auth/types/auth-user.type";
import { Body, Controller, Get, Param, Patch, UseGuards } from "@nestjs/common";
import {
	ApiBearerAuth,
	ApiOkResponse,
	ApiOperation,
	ApiParam,
	ApiTags,
} from "@nestjs/swagger";

import { TenantFeatureService } from "../../services/tenant-feature.service";
import { UpdateTenantRequestDto } from "./requests";
import { TenantResponseDto } from "./responses";

// Tenant-management intent for a specific church. Admins read and update
// the church's metadata here. Members read their church through
// /me/church instead.
@ApiTags("tenants (tenant)")
@ApiBearerAuth("Bearer")
@ApiParam({ name: "tenantId", description: "Tenant UUID or slug" })
@UseGuards(TenantGuard)
@Controller("tenants/:tenantId")
export class TenantTenantController {
	constructor(private readonly tenantFeatureService: TenantFeatureService) {}

	@Get()
	@ApiOperation({ summary: "Get tenant metadata (admin perspective)" })
	@ApiOkResponse({ type: TenantResponseDto })
	async getById(
		@CurrentAbility() ability: AppAbility,
		@Param("tenantId") idOrSlug: string,
	): Promise<TenantResponseDto> {
		const tenant = await this.tenantFeatureService.getByIdOrSlug(idOrSlug);
		assertCan(ability, "read", asSubject("Tenant", tenant));
		return tenant as unknown as TenantResponseDto;
	}

	@Patch()
	@ApiOperation({ summary: "Update tenant metadata (admin only)" })
	@ApiOkResponse({ type: TenantResponseDto })
	async update(
		@CurrentUser() user: AuthUser,
		@CurrentAbility() ability: AppAbility,
		@Param("tenantId") idOrSlug: string,
		@Body() body: UpdateTenantRequestDto,
	): Promise<TenantResponseDto> {
		const tenant = await this.tenantFeatureService.getByIdOrSlug(idOrSlug);
		assertCan(ability, "update", asSubject("Tenant", tenant));
		return this.tenantFeatureService.update(
			user,
			tenant.id,
			body,
		) as unknown as Promise<TenantResponseDto>;
	}
}
