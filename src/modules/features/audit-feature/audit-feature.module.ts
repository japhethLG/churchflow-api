import { AuditCoreModule } from "@modules/core/audit/audit.module";
import { Module } from "@nestjs/common";

import { AuditPlatformController } from "./controllers/platform";
import { AuditFeatureService } from "./services/audit-feature.service";

@Module({
	imports: [AuditCoreModule],
	controllers: [AuditPlatformController],
	providers: [AuditFeatureService],
})
export class AuditFeatureModule {}
