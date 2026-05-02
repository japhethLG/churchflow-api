import { CurrentUser } from "@infrastructure/firebase-auth/decorators/current-user.decorator";
import { Roles } from "@infrastructure/firebase-auth/decorators/roles.decorator";
import type { AuthUser } from "@infrastructure/firebase-auth/types/auth-user.type";
import { Body, Controller, Get, Param, Patch, Query } from "@nestjs/common";
import {
	ApiBearerAuth,
	ApiOkResponse,
	ApiOperation,
	ApiParam,
	ApiTags,
} from "@nestjs/swagger";

import type {
	AdminUsersQueryDto,
	ToggleSuperAdminRequestDto,
} from "../dto/admin.request.dto";
import {
	AdminUserDto,
	AdminUserListResponseDto,
	PlatformStatsDto,
} from "../dto/admin.response.dto";
import type { AdminFeatureService } from "../services/admin-feature.service";

@ApiTags("admin")
@ApiBearerAuth("Bearer")
@Roles("SUPER_ADMIN")
@Controller("admin")
export class AdminController {
	constructor(private readonly adminFeatureService: AdminFeatureService) {}

	@Get("stats")
	@ApiOperation({ summary: "Platform-wide KPI statistics (super admin only)" })
	@ApiOkResponse({ type: PlatformStatsDto })
	async getStats(): Promise<PlatformStatsDto> {
		return this.adminFeatureService.getPlatformStats();
	}

	@Get("users")
	@ApiOperation({
		summary:
			"List all users with admin roles across all tenants (super admin only)",
	})
	@ApiOkResponse({ type: AdminUserListResponseDto })
	async listUsers(
		@Query() query: AdminUsersQueryDto,
	): Promise<AdminUserListResponseDto> {
		return this.adminFeatureService.listUsers(query);
	}

	@Patch("users/:id")
	@ApiOperation({
		summary: "Toggle super-admin status for a user (super admin only)",
	})
	@ApiParam({ name: "id", description: "User UUID" })
	@ApiOkResponse({ type: AdminUserDto })
	async toggleSuperAdmin(
		@CurrentUser() user: AuthUser,
		@Param("id") id: string,
		@Body() body: ToggleSuperAdminRequestDto,
	): Promise<AdminUserDto> {
		return this.adminFeatureService.toggleSuperAdmin(user, id, body);
	}
}
