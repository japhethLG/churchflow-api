import { AuditCoreModule } from "@modules/core/audit/audit.module";
import { MemberCoreModule } from "@modules/core/member/member.module";
import { PledgeCoreModule } from "@modules/core/pledge/pledge.module";
import { TransactionCoreModule } from "@modules/core/transaction/transaction.module";
import { UserCoreModule } from "@modules/core/user/user.module";
import { Module } from "@nestjs/common";

import { MemberMergingService } from "./services/member-merging.service";

@Module({
	imports: [
		MemberCoreModule,
		TransactionCoreModule,
		PledgeCoreModule,
		UserCoreModule,
		AuditCoreModule,
	],
	providers: [MemberMergingService],
	exports: [MemberMergingService],
})
export class MemberMergingModule {}
