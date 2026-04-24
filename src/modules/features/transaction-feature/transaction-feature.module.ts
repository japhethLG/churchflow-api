import { Module } from '@nestjs/common';

import { AuditCoreModule } from '@modules/core/audit/audit.module';
import { CampaignItemCoreModule } from '@modules/core/campaign-item/campaign-item.module';
import { CampaignCoreModule } from '@modules/core/campaign/campaign.module';
import { MemberCoreModule } from '@modules/core/member/member.module';
import { PledgeCoreModule } from '@modules/core/pledge/pledge.module';
import { TenantCoreModule } from '@modules/core/tenant/tenant.module';
import { TransactionCoreModule } from '@modules/core/transaction/transaction.module';

import { TransactionController } from './controllers/transaction.controller';
import { TransactionFeatureService } from './services/transaction-feature.service';

@Module({
  imports: [
    TransactionCoreModule,
    TenantCoreModule,
    MemberCoreModule,
    CampaignCoreModule,
    CampaignItemCoreModule,
    PledgeCoreModule,
    AuditCoreModule,
  ],
  controllers: [TransactionController],
  providers: [TransactionFeatureService],
})
export class TransactionFeatureModule {}
