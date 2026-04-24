import { Module } from '@nestjs/common';

import { AuditCoreModule } from '@modules/core/audit/audit.module';
import { CampaignItemCoreModule } from '@modules/core/campaign-item/campaign-item.module';
import { CampaignCoreModule } from '@modules/core/campaign/campaign.module';
import { MemberCoreModule } from '@modules/core/member/member.module';
import { PledgeCoreModule } from '@modules/core/pledge/pledge.module';

import { PledgeController } from './controllers/pledge.controller';
import { PledgeFeatureService } from './services/pledge-feature.service';

@Module({
  imports: [
    PledgeCoreModule,
    CampaignCoreModule,
    CampaignItemCoreModule,
    MemberCoreModule,
    AuditCoreModule,
  ],
  controllers: [PledgeController],
  providers: [PledgeFeatureService],
})
export class PledgeFeatureModule {}
