import { Module } from '@nestjs/common';

import { CampaignItemRepository } from './repository/campaign-item.repository';
import { CampaignItemService } from './services/campaign-item.service';

@Module({
  providers: [CampaignItemRepository, CampaignItemService],
  exports: [CampaignItemService],
})
export class CampaignItemCoreModule {}
