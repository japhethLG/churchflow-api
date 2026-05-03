import {
	type AppAbility,
	assertCan,
	CurrentAbility,
} from "@infrastructure/authorization";
import { CurrentUser } from "@infrastructure/firebase-auth/decorators/current-user.decorator";
import { RefreshesClaims } from "@infrastructure/firebase-auth/decorators/refreshes-claims.decorator";
import { Roles } from "@infrastructure/firebase-auth/decorators/roles.decorator";
import { AuthUser } from "@infrastructure/firebase-auth/types/auth-user.type";
import { Body, Controller, Get, Param, Patch, Query } from "@nestjs/common";
import {
	ApiBearerAuth,
	ApiOkResponse,
	ApiOperation,
	ApiParam,
	ApiTags,
} from "@nestjs/swagger";

import { AdminFeatureService } from "../../services/admin-feature.service";
import {
	AdminUsersQueryDto,
	ToggleSuperAdminRequestDto,
} from "./requests";
import {
	AdminUserDto,
	AdminUserListResponseDto,
	PlatformStatsDto,
} from "./responses";

// Platform intent for super-admin tooling: cross-tenant stats and the
// platform user directory.
@ApiTags("admin (platform)")
@ApiBearerAuth("Bearer")
@Roles("SUPER_ADMIN")
@Controller("platform")
export class AdminPlatformController {
	constructor(private readonly adminFeatureService: AdminFeatureService) {}

	@Get("stats")
	@ApiOperation({ summary: "Platform-wide KPI statistics (super-admin only)" })
	@ApiOkResponse({ type: PlatformStatsDto })
	async getStats(
		@CurrentAbility() ability: AppAbility,
	): Promise<PlatformStatsDto> {
		assertCan(ability, "read", "PlatformAdmin");
		return this.adminFeatureService.getPlatformStats() as unknown as Promise<PlatformStatsDto>;
	}

	@Get("users")
	@ApiOperation({
		summary:
			"List all users with admin roles across all tenants (super-admin only)",
	})
	@ApiOkResponse({ type: AdminUserListResponseDto })
	async listUsers(
		@CurrentAbility() ability: AppAbility,
		@Query() query: AdminUsersQueryDto,
	): Promise<AdminUserListResponseDto> {
		assertCan(ability, "read", "PlatformAdmin");
		return this.adminFeatureService.listUsers(
			query,
		) as unknown as Promise<AdminUserListResponseDto>;
	}

	@Patch("users/:id")
	@RefreshesClaims()
	@ApiOperation({
		summary: "Toggle super-admin status for a user (super-admin only)",
	})
	@ApiParam({ name: "id", description: "User UUID" })
	@ApiOkResponse({ type: AdminUserDto })
	async toggleSuperAdmin(
		@CurrentUser() user: AuthUser,
		@CurrentAbility() ability: AppAbility,
		@Param("id") id: string,
		@Body() body: ToggleSuperAdminRequestDto,
	): Promise<AdminUserDto> {
		assertCan(ability, "update", "PlatformAdmin");
		return this.adminFeatureService.toggleSuperAdmin(
			user,
			id,
			body,
		) as unknown as Promise<AdminUserDto>;
	}
}
