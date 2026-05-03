import { CurrentUser } from "@infrastructure/firebase-auth/decorators/current-user.decorator";
import { Public } from "@infrastructure/firebase-auth/decorators/public.decorator";
import { RefreshesClaims } from "@infrastructure/firebase-auth/decorators/refreshes-claims.decorator";
import { AuthUser } from "@infrastructure/firebase-auth/types/auth-user.type";
import { InvitationProcessingService } from "@modules/processes/invitation-processing/services/invitation-processing.service";
import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import {
	ApiBearerAuth,
	ApiOkResponse,
	ApiOperation,
	ApiQuery,
	ApiTags,
} from "@nestjs/swagger";

import { AcceptInvitationRequestDto } from "./requests";
import {
	LookupInvitationResponseDto,
	PublicInvitationResponseDto,
} from "./responses";

// Public intent for invitations: endpoints that have no specific tenant
// context in the URL because the invitation token itself encodes which
// tenant the invitee is joining.
//
// - `lookup` is fully unauthenticated — invitees hit this from the email
//   link before signing in to display "You've been invited to ..." copy.
// - `accept` is authenticated (the caller's Firebase identity is bound to
//   the invitation) but is not tenant-scoped, so it lives here rather
//   than under tenant/.
@ApiTags("invitations (public)")
@Controller()
export class InvitationPublicController {
	constructor(
		private readonly invitationProcessing: InvitationProcessingService,
	) {}

	@Public()
	@Get("invitations/lookup")
	@ApiOperation({ summary: "Look up an invitation by token (public)" })
	@ApiQuery({ name: "token" })
	@ApiOkResponse({ type: LookupInvitationResponseDto })
	async lookup(
		@Query("token") token: string,
	): Promise<LookupInvitationResponseDto> {
		return this.invitationProcessing.lookup(
			token,
		) as unknown as Promise<LookupInvitationResponseDto>;
	}

	@ApiBearerAuth("Bearer")
	@RefreshesClaims()
	@Post("invitations/accept")
	@ApiOperation({
		summary: "Accept an invitation using the token emailed to the invitee",
		description:
			"Authenticated but not tenant-scoped — the token determines which tenant the caller joins.",
	})
	@ApiOkResponse({ type: PublicInvitationResponseDto })
	async accept(
		@CurrentUser() user: AuthUser,
		@Body() body: AcceptInvitationRequestDto,
	): Promise<PublicInvitationResponseDto> {
		return this.invitationProcessing.accept(
			body.token,
			user.firebaseUid,
		) as unknown as Promise<PublicInvitationResponseDto>;
	}
}
