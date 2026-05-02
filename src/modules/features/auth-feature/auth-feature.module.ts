import { MemberCoreModule } from "@modules/core/member/member.module";
import { TenantCoreModule } from "@modules/core/tenant/tenant.module";
import { UserCoreModule } from "@modules/core/user/user.module";
import { Module } from "@nestjs/common";

import { AuthController } from "./controllers/auth.controller";
import { AuthFeatureService } from "./services/auth-feature.service";

@Module({
	imports: [UserCoreModule, TenantCoreModule, MemberCoreModule],
	controllers: [AuthController],
	providers: [AuthFeatureService],
})
export class AuthFeatureModule {}
