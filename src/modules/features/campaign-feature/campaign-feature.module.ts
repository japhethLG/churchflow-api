import { AuditCoreModule } from "@modules/core/audit/audit.module";
import { CampaignCoreModule } from "@modules/core/campaign/campaign.module";
import { CampaignItemCoreModule } from "@modules/core/campaign-item/campaign-item.module";
import { TenantCoreModule } from "@modules/core/tenant/tenant.module";
import { Module } from "@nestjs/common";

import { CampaignController } from "./controllers/campaign.controller";
import { CampaignFeatureService } from "./services/campaign-feature.service";

@Module({
	imports: [
		CampaignCoreModule,
		CampaignItemCoreModule,
		TenantCoreModule,
		AuditCoreModule,
	],
	controllers: [CampaignController],
	providers: [CampaignFeatureService],
})
export class CampaignFeatureModule {}
