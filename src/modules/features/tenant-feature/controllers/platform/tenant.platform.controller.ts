import {
	type AppAbility,
	assertCan,
	CurrentAbility,
} from "@infrastructure/authorization";
import { CurrentUser } from "@infrastructure/firebase-auth/decorators/current-user.decorator";
import { Roles } from "@infrastructure/firebase-auth/decorators/roles.decorator";
import { AuthUser } from "@infrastructure/firebase-auth/types/auth-user.type";
import {
	Body,
	Controller,
	Delete,
	Get,
	Param,
	Patch,
	Post,
	Query,
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

import { TenantFeatureService } from "../../services/tenant-feature.service";
import {
	CreateTenantRequestDto,
	RenameTenantRequestDto,
} from "./requests";
import { TenantListResponseDto, TenantResponseDto } from "./responses";

// Platform intent for tenants. Operates across the entire platform; only
// super-admins can call these. The @Roles guard enforces the platform
// role at the gateway; CASL `manage all` matches inside.
@ApiTags("tenants (platform)")
@ApiBearerAuth("Bearer")
@Roles("SUPER_ADMIN")
@Controller("platform/tenants")
export class TenantPlatformController {
	constructor(private readonly tenantFeatureService: TenantFeatureService) {}

	@Post()
	@ApiOperation({ summary: "Create a new church (super-admin only)" })
	@ApiCreatedResponse({ type: TenantResponseDto })
	async create(
		@CurrentUser() user: AuthUser,
		@CurrentAbility() ability: AppAbility,
		@Body() body: CreateTenantRequestDto,
	): Promise<TenantResponseDto> {
		assertCan(ability, "create", "Tenant");
		return this.tenantFeatureService.create(
			user,
			body,
		) as unknown as Promise<TenantResponseDto>;
	}

	@Get()
	@ApiOperation({
		summary: "List all churches with per-tenant aggregates (super-admin only)",
	})
	@ApiOkResponse({ type: TenantListResponseDto })
	async list(
		@CurrentAbility() ability: AppAbility,
	): Promise<TenantListResponseDto> {
		assertCan(ability, "read", "Tenant");
		const items = await this.tenantFeatureService.list();
		return { items } as unknown as TenantListResponseDto;
	}

	// Slug suggestion helper for the create-tenant UI. Slugifies the name
	// while the super-admin types.
	@Get("slug-suggestion")
	@ApiOperation({ summary: "Suggest a slug from a tenant name" })
	@ApiQuery({ name: "name" })
	@ApiOkResponse({
		schema: { type: "object", properties: { slug: { type: "string" } } },
	})
	async suggestSlug(
		@CurrentAbility() ability: AppAbility,
		@Query("name") name: string,
	): Promise<{ slug: string }> {
		assertCan(ability, "create", "Tenant");
		return { slug: this.tenantFeatureService.suggestSlug(name ?? "") };
	}

	@Patch(":tenantId/slug")
	@ApiOperation({ summary: "Rename a church slug (super-admin only)" })
	@ApiParam({ name: "tenantId", description: "Tenant UUID or slug" })
	@ApiOkResponse({ type: TenantResponseDto })
	async rename(
		@CurrentUser() user: AuthUser,
		@CurrentAbility() ability: AppAbility,
		@Param("tenantId") idOrSlug: string,
		@Body() body: RenameTenantRequestDto,
	): Promise<TenantResponseDto> {
		assertCan(ability, "update", "Tenant");
		const tenant = await this.tenantFeatureService.getByIdOrSlug(idOrSlug);
		return this.tenantFeatureService.rename(
			user,
			tenant.id,
			body,
		) as unknown as Promise<TenantResponseDto>;
	}

	@Delete(":tenantId")
	@ApiOperation({ summary: "Soft-delete a church (super-admin only)" })
	@ApiParam({ name: "tenantId", description: "Tenant UUID or slug" })
	@ApiOkResponse({ type: DeleteResponseDto })
	async delete(
		@CurrentUser() user: AuthUser,
		@CurrentAbility() ability: AppAbility,
		@Param("tenantId") idOrSlug: string,
	): Promise<DeleteResponseDto> {
		assertCan(ability, "delete", "Tenant");
		const tenant = await this.tenantFeatureService.getByIdOrSlug(idOrSlug);
		const deleted = await this.tenantFeatureService.delete(user, tenant.id);
		return { id: deleted.id };
	}

	@Post(":tenantId/restore")
	@ApiOperation({ summary: "Restore a soft-deleted church (super-admin only)" })
	@ApiParam({
		name: "tenantId",
		description: "Tenant UUID (slug not supported for soft-deleted rows)",
	})
	@ApiOkResponse({ type: TenantResponseDto })
	async restore(
		@CurrentUser() user: AuthUser,
		@CurrentAbility() ability: AppAbility,
		@Param("tenantId") id: string,
	): Promise<TenantResponseDto> {
		assertCan(ability, "update", "Tenant");
		return this.tenantFeatureService.restore(
			user,
			id,
		) as unknown as Promise<TenantResponseDto>;
	}
}
