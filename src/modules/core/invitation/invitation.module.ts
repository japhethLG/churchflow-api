import { Module } from "@nestjs/common";

import { InvitationRepository } from "./repository/invitation.repository";
import { InvitationService } from "./services/invitation.service";

@Module({
	providers: [InvitationRepository, InvitationService],
	exports: [InvitationService],
})
export class InvitationCoreModule {}
