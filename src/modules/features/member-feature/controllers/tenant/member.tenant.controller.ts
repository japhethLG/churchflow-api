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

import { MemberFeatureService } from "../../services/member-feature.service";
import {
	CreateMemberRequestDto,
	MemberFiltersRequestDto,
	MergeMembersRequestDto,
	UpdateMemberRequestDto,
} from "./requests";
import {
	MemberListResponseDto,
	MemberResponseDto,
	MergeMembersPreviewResponseDto,
	MergeMembersResponseDto,
} from "./responses";

// Tenant-management intent for members. Available to admins (and
// super-admins via TenantGuard pass-through). Members manage their own
// profile through /me/profile instead.
@ApiTags("members (tenant)")
@ApiBearerAuth("Bearer")
@ApiParam({ name: "tenantId", description: "Tenant UUID or slug" })
@UseGuards(TenantGuard)
@Controller("tenants/:tenantId/members")
export class MemberTenantController {
	constructor(private readonly memberFeatureService: MemberFeatureService) {}

	@Post()
	@ApiOperation({ summary: "Create a temp member (admin only)" })
	@ApiCreatedResponse({ type: MemberResponseDto })
	async create(
		@CurrentUser() user: AuthUser,
		@CurrentTenant() tenant: TenantContext,
		@CurrentAbility() ability: AppAbility,
		@Body() body: CreateMemberRequestDto,
	): Promise<MemberResponseDto> {
		assertCan(ability, "create", "Member");
		return this.memberFeatureService.create(
			user,
			tenant,
			body,
		) as unknown as Promise<MemberResponseDto>;
	}

	@Get()
	@ApiOperation({ summary: "List members (admin only)" })
	@ApiOkResponse({ type: MemberListResponseDto })
	async list(
		@CurrentTenant() tenant: TenantContext,
		@CurrentAbility() ability: AppAbility,
		@Query() filters: MemberFiltersRequestDto,
	): Promise<MemberListResponseDto> {
		assertCan(ability, "read", "Member");
		const result = await this.memberFeatureService.list(tenant, filters);
		return {
			items: result.items as unknown as MemberResponseDto[],
			meta: {
				offset: filters.offset ?? 0,
				limit: filters.limit ?? result.items.length,
				total: result.total,
			},
		};
	}

	@Get(":id")
	@ApiOperation({ summary: "Get a member by id (admin only)" })
	@ApiQuery({
		name: "includeDeleted",
		required: false,
		type: Boolean,
		description:
			"Return the member even if soft-deleted (banner-style archived view).",
	})
	@ApiOkResponse({ type: MemberResponseDto })
	async getById(
		@CurrentTenant() tenant: TenantContext,
		@CurrentAbility() ability: AppAbility,
		@Param("id") id: string,
		@Query("includeDeleted") includeDeleted?: boolean,
	): Promise<MemberResponseDto> {
		const member = await this.memberFeatureService.getById(tenant, id, {
			includeDeleted,
		});
		assertCan(ability, "read", asSubject("Member", member));
		return member as unknown as MemberResponseDto;
	}

	@Patch(":id")
	@ApiOperation({ summary: "Update a member (admin only)" })
	@ApiOkResponse({ type: MemberResponseDto })
	async update(
		@CurrentUser() user: AuthUser,
		@CurrentTenant() tenant: TenantContext,
		@CurrentAbility() ability: AppAbility,
		@Param("id") id: string,
		@Body() body: UpdateMemberRequestDto,
	): Promise<MemberResponseDto> {
		const existing = await this.memberFeatureService.getById(tenant, id);
		assertCan(ability, "update", asSubject("Member", existing));
		return this.memberFeatureService.update(
			user,
			tenant,
			id,
			body,
		) as unknown as Promise<MemberResponseDto>;
	}

	@Delete(":id")
	@ApiOperation({ summary: "Soft-delete a member (admin only)" })
	@ApiOkResponse({ type: DeleteResponseDto })
	async delete(
		@CurrentUser() user: AuthUser,
		@CurrentTenant() tenant: TenantContext,
		@CurrentAbility() ability: AppAbility,
		@Param("id") id: string,
	): Promise<DeleteResponseDto> {
		const existing = await this.memberFeatureService.getById(tenant, id);
		assertCan(ability, "delete", asSubject("Member", existing));
		const deleted = await this.memberFeatureService.delete(user, tenant, id);
		return { id: deleted.id };
	}

	@Post(":id/restore")
	@ApiOperation({ summary: "Restore a soft-deleted member (admin only)" })
	@ApiOkResponse({ type: MemberResponseDto })
	async restore(
		@CurrentUser() user: AuthUser,
		@CurrentTenant() tenant: TenantContext,
		@CurrentAbility() ability: AppAbility,
		@Param("id") id: string,
	): Promise<MemberResponseDto> {
		assertCan(ability, "restore", "Member");
		return this.memberFeatureService.restore(
			user,
			tenant,
			id,
		) as unknown as Promise<MemberResponseDto>;
	}

	@Get(":id/merge-preview")
	@ApiOperation({
		summary: "Preview a merge: shows what will move from drop → keep",
		description:
			"Use to render a confirmation modal. Pass the candidate to drop via ?dropId=. Admin only.",
	})
	@ApiParam({
		name: "id",
		description: "Keep member id (the surviving member)",
	})
	@ApiOkResponse({ type: MergeMembersPreviewResponseDto })
	async mergePreview(
		@CurrentTenant() tenant: TenantContext,
		@CurrentAbility() ability: AppAbility,
		@Param("id") keepId: string,
		@Query("dropId") dropId: string,
	): Promise<MergeMembersPreviewResponseDto> {
		assertCan(ability, "update", "Member");
		return this.memberFeatureService.previewMerge(
			tenant,
			keepId,
			dropId,
		) as unknown as Promise<MergeMembersPreviewResponseDto>;
	}

	@Post(":id/merge")
	@ApiOperation({
		summary: "Merge another member into this one (admin only)",
		description:
			"Reassigns transactions and pledges from the drop member to this one, copies any contact fields the keeper is missing, then soft-deletes the drop member.",
	})
	@ApiParam({
		name: "id",
		description: "Keep member id (the surviving member)",
	})
	@ApiOkResponse({ type: MergeMembersResponseDto })
	async merge(
		@CurrentUser() user: AuthUser,
		@CurrentTenant() tenant: TenantContext,
		@CurrentAbility() ability: AppAbility,
		@Param("id") keepId: string,
		@Body() body: MergeMembersRequestDto,
	): Promise<MergeMembersResponseDto> {
		assertCan(ability, "update", "Member");
		return this.memberFeatureService.merge(
			user,
			tenant,
			keepId,
			body.dropId,
		) as unknown as Promise<MergeMembersResponseDto>;
	}
}
