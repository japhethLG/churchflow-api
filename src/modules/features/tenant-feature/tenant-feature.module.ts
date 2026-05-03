import { PrismaClientModule } from "@infrastructure/prisma-client/prisma-client.module";
import { AuditCoreModule } from "@modules/core/audit/audit.module";
import { TenantCoreModule } from "@modules/core/tenant/tenant.module";
import { Module } from "@nestjs/common";

import { TenantPlatformController } from "./controllers/platform";
import { TenantSelfController } from "./controllers/self";
import { TenantTenantController } from "./controllers/tenant";
import { TenantFeatureService } from "./services/tenant-feature.service";

@Module({
	imports: [TenantCoreModule, AuditCoreModule, PrismaClientModule],
	controllers: [
		TenantPlatformController,
		TenantTenantController,
		TenantSelfController,
	],
	providers: [TenantFeatureService],
})
export class TenantFeatureModule {}
