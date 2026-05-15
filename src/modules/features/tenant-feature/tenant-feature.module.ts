import { AuditCoreModule } from "@modules/core/audit/audit.module";
import { MemberCoreModule } from "@modules/core/member/member.module";
import { TenantCoreModule } from "@modules/core/tenant/tenant.module";
import { TransactionCoreModule } from "@modules/core/transaction/transaction.module";
import { Module } from "@nestjs/common";

import { TenantPlatformController } from "./controllers/platform";
import { TenantSelfController } from "./controllers/self";
import { TenantTenantController } from "./controllers/tenant";
import { TenantFeatureService } from "./services/tenant-feature.service";

@Module({
	imports: [
		TenantCoreModule,
		MemberCoreModule,
		TransactionCoreModule,
		AuditCoreModule,
	],
	controllers: [
		TenantPlatformController,
		TenantTenantController,
		TenantSelfController,
	],
	providers: [TenantFeatureService],
})
export class TenantFeatureModule {}
