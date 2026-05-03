import { InvitationProcessingModule } from "@modules/processes/invitation-processing/invitation-processing.module";
import { Module } from "@nestjs/common";

import { InvitationPublicController } from "./controllers/public";
import { InvitationTenantController } from "./controllers/tenant";

@Module({
	imports: [InvitationProcessingModule],
	controllers: [InvitationTenantController, InvitationPublicController],
})
export class InvitationFeatureModule {}
