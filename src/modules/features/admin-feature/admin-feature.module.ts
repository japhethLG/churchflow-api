import { PrismaClientModule } from "@infrastructure/prisma-client/prisma-client.module";
import { AuditCoreModule } from "@modules/core/audit/audit.module";
import { UserCoreModule } from "@modules/core/user/user.module";
import { Module } from "@nestjs/common";

import { AdminPlatformController } from "./controllers/platform";
import { AdminFeatureService } from "./services/admin-feature.service";

@Module({
	imports: [PrismaClientModule, UserCoreModule, AuditCoreModule],
	controllers: [AdminPlatformController],
	providers: [AdminFeatureService],
})
export class AdminFeatureModule {}
