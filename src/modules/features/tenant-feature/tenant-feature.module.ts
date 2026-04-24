import { Module } from '@nestjs/common';

import { AuditCoreModule } from '@modules/core/audit/audit.module';
import { TenantCoreModule } from '@modules/core/tenant/tenant.module';

import { TenantController } from './controllers/tenant.controller';
import { TenantFeatureService } from './services/tenant-feature.service';

@Module({
  imports: [TenantCoreModule, AuditCoreModule],
  controllers: [TenantController],
  providers: [TenantFeatureService],
})
export class TenantFeatureModule {}
