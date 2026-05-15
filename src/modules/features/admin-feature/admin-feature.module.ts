import { AuditCoreModule } from "@modules/core/audit/audit.module";
import { MemberCoreModule } from "@modules/core/member/member.module";
import { TenantCoreModule } from "@modules/core/tenant/tenant.module";
import { TransactionCoreModule } from "@modules/core/transaction/transaction.module";
import { UserCoreModule } from "@modules/core/user/user.module";
import { Module } from "@nestjs/common";

import { AdminPlatformController } from "./controllers/platform";
import { AdminFeatureService } from "./services/admin-feature.service";

@Module({
	imports: [
		TenantCoreModule,
		MemberCoreModule,
		TransactionCoreModule,
		UserCoreModule,
		AuditCoreModule,
	],
	controllers: [AdminPlatformController],
	providers: [AdminFeatureService],
})
export class AdminFeatureModule {}
