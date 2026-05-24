import { AuditCoreModule } from "@modules/core/audit/audit.module";
import { MemberCoreModule } from "@modules/core/member/member.module";
import { PledgeCoreModule } from "@modules/core/pledge/pledge.module";
import { TransactionCoreModule } from "@modules/core/transaction/transaction.module";
import { UserCoreModule } from "@modules/core/user/user.module";
import { MemberMergingModule } from "@modules/processes/member-merging/member-merging.module";
import { Module } from "@nestjs/common";

import { MemberSelfController } from "./controllers/self";
import { MemberTenantController } from "./controllers/tenant";
import { MemberFeatureService } from "./services/member-feature.service";

@Module({
	imports: [
		MemberCoreModule,
		UserCoreModule,
		AuditCoreModule,
		MemberMergingModule,
		TransactionCoreModule,
		PledgeCoreModule,
	],
	controllers: [MemberTenantController, MemberSelfController],
	providers: [MemberFeatureService],
})
export class MemberFeatureModule {}
