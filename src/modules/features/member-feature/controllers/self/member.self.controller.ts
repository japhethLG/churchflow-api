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
	Patch,
	UseGuards,
} from "@nestjs/common";
import {
	ApiBearerAuth,
	ApiOkResponse,
	ApiOperation,
	ApiParam,
	ApiTags,
} from "@nestjs/swagger";

import { MemberFeatureService } from "../../services/member-feature.service";
import { UpdateMyProfileRequestDto } from "./requests";
import { MyProfileResponseDto } from "./responses";

// Self-service intent: a member's own profile in this tenant. The
// resource is singular (one profile per caller per tenant) so the
// controller mounts at /me/profile rather than /me/profile/:id.
//
// Super-admins without a Member row in this tenant get 404 here — that
// matches the existing behavior of the legacy /members/me endpoint.
@ApiTags("members (self)")
@ApiBearerAuth("Bearer")
@ApiParam({ name: "tenantId", description: "Tenant UUID or slug" })
@UseGuards(TenantGuard)
@Controller("tenants/:tenantId/me/profile")
export class MemberSelfController {
	constructor(private readonly memberFeatureService: MemberFeatureService) {}

	@Get()
	@ApiOperation({
		summary: "Get the authenticated caller's member profile in this tenant",
	})
	@ApiOkResponse({ type: MyProfileResponseDto })
	async getMyProfile(
		@CurrentTenant() tenant: TenantContext,
		@CurrentAbility() ability: AppAbility,
	): Promise<MyProfileResponseDto> {
		const memberId = this.requireMemberContext(tenant);
		const member = await this.memberFeatureService.getMember(tenant, memberId);
		assertCan(ability, "read", asSubject("Member", member));
		return member as unknown as MyProfileResponseDto;
	}

	@Patch()
	@ApiOperation({
		summary: "Update the authenticated caller's member profile",
		description:
			"First/last name, phone, and address. Email is bound to SSO; role + status are admin-only.",
	})
	@ApiOkResponse({ type: MyProfileResponseDto })
	async updateMyProfile(
		@CurrentUser() user: AuthUser,
		@CurrentTenant() tenant: TenantContext,
		@CurrentAbility() ability: AppAbility,
		@Body() body: UpdateMyProfileRequestDto,
	): Promise<MyProfileResponseDto> {
		const memberId = this.requireMemberContext(tenant);
		const existing = await this.memberFeatureService.getMember(
			tenant,
			memberId,
		);
		assertCan(ability, "update", asSubject("Member", existing));
		return this.memberFeatureService.updateProfile(
			user,
			tenant,
			memberId,
			body,
		) as unknown as Promise<MyProfileResponseDto>;
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
