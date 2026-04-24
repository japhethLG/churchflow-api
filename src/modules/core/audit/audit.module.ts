import { Module } from '@nestjs/common';

import { AuditRepository } from './repository/audit.repository';
import { AuditService } from './services/audit.service';

@Module({
  providers: [AuditRepository, AuditService],
  exports: [AuditService],
})
export class AuditCoreModule {}
