import {
	type AppAbility,
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
import { InvitationProcessingService } from "@modules/processes/invitation-processing/services/invitation-processing.service";
import {
	Body,
	Controller,
	Get,
	Param,
	Patch,
	Post,
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

import { IssueInvitationRequestDto } from "./requests";
import { InvitationListResponseDto, InvitationResponseDto } from "./responses";

// Tenant-management intent for invitations. Admins issue, list and cancel
// pending invitations here. Members do not see this surface — they
// interact with invitations only through the public lookup/accept flow.
@ApiTags("invitations (tenant)")
@ApiBearerAuth("Bearer")
@ApiParam({ name: "tenantId", description: "Tenant UUID or slug" })
@UseGuards(TenantGuard)
@Controller("tenants/:tenantId/invitations")
export class InvitationTenantController {
	constructor(
		private readonly invitationProcessing: InvitationProcessingService,
	) {}

	@Post()
	@ApiOperation({
		summary: "Issue an invitation to a member or admin (admin only)",
	})
	@ApiCreatedResponse({ type: InvitationResponseDto })
	async issue(
		@CurrentUser() user: AuthUser,
		@CurrentTenant() tenant: TenantContext,
		@CurrentAbility() ability: AppAbility,
		@Body() body: IssueInvitationRequestDto,
	): Promise<InvitationResponseDto> {
		assertCan(ability, "create", "Invitation");
		return this.invitationProcessing.issue({
			tenantId: tenant.tenantId,
			email: body.email,
			role: body.role,
			memberId: body.memberId,
			invitedBy: user.firebaseUid,
		}) as unknown as Promise<InvitationResponseDto>;
	}

	@Get()
	@ApiOperation({
		summary: "List pending invitations for a tenant (admin only)",
	})
	@ApiOkResponse({ type: InvitationListResponseDto })
	async list(
		@CurrentTenant() tenant: TenantContext,
		@CurrentAbility() ability: AppAbility,
	): Promise<InvitationListResponseDto> {
		assertCan(ability, "read", "Invitation");
		const items = await this.invitationProcessing.listPending(tenant.tenantId);
		return { items: items as unknown as InvitationResponseDto[] };
	}

	@Patch(":invitationId/cancel")
	@ApiOperation({ summary: "Cancel a pending invitation (admin only)" })
	@ApiParam({ name: "invitationId", description: "Invitation UUID" })
	@ApiOkResponse({ type: InvitationResponseDto })
	async cancel(
		@CurrentUser() user: AuthUser,
		@CurrentTenant() tenant: TenantContext,
		@CurrentAbility() ability: AppAbility,
		@Param("invitationId") invitationId: string,
	): Promise<InvitationResponseDto> {
		assertCan(ability, "delete", "Invitation");
		return this.invitationProcessing.cancelById(
			tenant.tenantId,
			invitationId,
			user.firebaseUid,
		) as unknown as Promise<InvitationResponseDto>;
	}
}
