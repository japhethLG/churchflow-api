import { Module } from "@nestjs/common";

import { TenantRepository } from "./repository/tenant.repository";
import { TenantService } from "./services/tenant.service";

@Module({
	providers: [TenantRepository, TenantService],
	exports: [TenantService],
})
export class TenantCoreModule {}
