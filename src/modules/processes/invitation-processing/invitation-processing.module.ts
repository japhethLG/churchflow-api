import { AuditCoreModule } from "@modules/core/audit/audit.module";
import { InvitationCoreModule } from "@modules/core/invitation/invitation.module";
import { MemberCoreModule } from "@modules/core/member/member.module";
import { TenantCoreModule } from "@modules/core/tenant/tenant.module";
import { UserCoreModule } from "@modules/core/user/user.module";
import { Module } from "@nestjs/common";

import { InvitationProcessingService } from "./services/invitation-processing.service";

@Module({
	imports: [
		InvitationCoreModule,
		MemberCoreModule,
		UserCoreModule,
		TenantCoreModule,
		AuditCoreModule,
	],
	providers: [InvitationProcessingService],
	exports: [InvitationProcessingService],
})
export class InvitationProcessingModule {}
