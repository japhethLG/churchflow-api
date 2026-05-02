import { Module } from "@nestjs/common";

import { CampaignRepository } from "./repository/campaign.repository";
import { CampaignService } from "./services/campaign.service";

@Module({
	providers: [CampaignRepository, CampaignService],
	exports: [CampaignService],
})
export class CampaignCoreModule {}
