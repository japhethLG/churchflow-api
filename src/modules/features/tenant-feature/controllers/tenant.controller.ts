import { CurrentUser } from "@infrastructure/firebase-auth/decorators/current-user.decorator";
import { Roles } from "@infrastructure/firebase-auth/decorators/roles.decorator";
import { TenantGuard } from "@infrastructure/firebase-auth/guards/tenant.guard";
import type { AuthUser } from "@infrastructure/firebase-auth/types/auth-user.type";
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

import type {
	CreateTenantRequestDto,
	RenameTenantRequestDto,
	UpdateTenantRequestDto,
} from "../dto/tenant.request.dto";
import {
	type TenantListItemDto,
	TenantListResponseDto,
	TenantResponseDto,
} from "../dto/tenant.response.dto";
import type { TenantFeatureService } from "../services/tenant-feature.service";

@ApiTags("tenants")
@ApiBearerAuth("Bearer")
@Controller("tenants")
export class TenantController {
	constructor(private readonly tenantFeatureService: TenantFeatureService) {}

	@Roles("SUPER_ADMIN")
	@Post()
	@ApiOperation({ summary: "Create a new church (super admin only)" })
	@ApiCreatedResponse({ type: TenantResponseDto })
	async create(
		@CurrentUser() user: AuthUser,
		@Body() body: CreateTenantRequestDto,
	): Promise<TenantResponseDto> {
		return this.tenantFeatureService.create(
			user,
			body,
		) as unknown as Promise<TenantResponseDto>;
	}

	@Roles("SUPER_ADMIN")
	@Get()
	@ApiOperation({
		summary: "List all churches with per-tenant aggregates (super admin only)",
	})
	@ApiOkResponse({ type: TenantListResponseDto })
	async list(): Promise<TenantListResponseDto> {
		const items: TenantListItemDto[] = await this.tenantFeatureService.list();
		return { items };
	}

	// Slug suggestion helper for the create-tenant UI. Not gated — the UI
	// calls this while the super-admin is typing. It just slugifies the
	// name.
	@Roles("SUPER_ADMIN")
	@Get("slug-suggestion")
	@ApiOperation({ summary: "Suggest a slug from a tenant name" })
	@ApiQuery({ name: "name" })
	@ApiOkResponse({
		schema: { type: "object", properties: { slug: { type: "string" } } },
	})
	async suggestSlug(@Query("name") name: string): Promise<{ slug: string }> {
		return { slug: this.tenantFeatureService.suggestSlug(name ?? "") };
	}

	@UseGuards(TenantGuard)
	@Get(":tenantId")
	@ApiOperation({
		summary: "Get a church by id or slug",
		description:
			"Caller must be a member of the tenant, or a super-admin. Accepts UUID or slug in :tenantId.",
	})
	@ApiParam({ name: "tenantId", description: "Tenant UUID or slug" })
	@ApiOkResponse({ type: TenantResponseDto })
	async getById(
		@Param("tenantId") idOrSlug: string,
	): Promise<TenantResponseDto> {
		return this.tenantFeatureService.getByIdOrSlug(
			idOrSlug,
		) as unknown as Promise<TenantResponseDto>;
	}

	@UseGuards(TenantGuard)
	@Patch(":tenantId")
	@ApiOperation({ summary: "Update a church (admin or super-admin)" })
	@ApiParam({ name: "tenantId", description: "Tenant UUID or slug" })
	@ApiOkResponse({ type: TenantResponseDto })
	async update(
		@CurrentUser() user: AuthUser,
		@Param("tenantId") idOrSlug: string,
		@Body() body: UpdateTenantRequestDto,
	): Promise<TenantResponseDto> {
		const tenant = await this.tenantFeatureService.getByIdOrSlug(idOrSlug);
		return this.tenantFeatureService.update(
			user,
			tenant.id,
			body,
		) as unknown as Promise<TenantResponseDto>;
	}

	@Roles("SUPER_ADMIN")
	@Patch(":tenantId/slug")
	@ApiOperation({ summary: "Rename a church slug (super admin only)" })
	@ApiParam({ name: "tenantId", description: "Tenant UUID or slug" })
	@ApiOkResponse({ type: TenantResponseDto })
	async rename(
		@CurrentUser() user: AuthUser,
		@Param("tenantId") idOrSlug: string,
		@Body() body: RenameTenantRequestDto,
	): Promise<TenantResponseDto> {
		const tenant = await this.tenantFeatureService.getByIdOrSlug(idOrSlug);
		return this.tenantFeatureService.rename(
			user,
			tenant.id,
			body,
		) as unknown as Promise<TenantResponseDto>;
	}

	@Roles("SUPER_ADMIN")
	@Delete(":tenantId")
	@ApiOperation({ summary: "Soft-delete a church (super admin only)" })
	@ApiParam({ name: "tenantId", description: "Tenant UUID or slug" })
	@ApiOkResponse({ type: DeleteResponseDto })
	async delete(
		@CurrentUser() user: AuthUser,
		@Param("tenantId") idOrSlug: string,
	): Promise<DeleteResponseDto> {
		const tenant = await this.tenantFeatureService.getByIdOrSlug(idOrSlug);
		const deleted = await this.tenantFeatureService.delete(user, tenant.id);
		return { id: deleted.id };
	}

	@Roles("SUPER_ADMIN")
	@Post(":tenantId/restore")
	@ApiOperation({ summary: "Restore a soft-deleted church (super admin only)" })
	@ApiParam({
		name: "tenantId",
		description: "Tenant UUID (slug not supported for soft-deleted rows)",
	})
	@ApiOkResponse({ type: TenantResponseDto })
	async restore(
		@CurrentUser() user: AuthUser,
		@Param("tenantId") id: string,
	): Promise<TenantResponseDto> {
		return this.tenantFeatureService.restore(
			user,
			id,
		) as unknown as Promise<TenantResponseDto>;
	}
}
