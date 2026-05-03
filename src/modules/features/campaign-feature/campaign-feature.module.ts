import { AuditCoreModule } from "@modules/core/audit/audit.module";
import { CampaignCoreModule } from "@modules/core/campaign/campaign.module";
import { CampaignItemCoreModule } from "@modules/core/campaign-item/campaign-item.module";
import { TenantCoreModule } from "@modules/core/tenant/tenant.module";
import { Module } from "@nestjs/common";

import { CampaignSelfController } from "./controllers/self";
import { CampaignTenantController } from "./controllers/tenant";
import { CampaignFeatureService } from "./services/campaign-feature.service";

@Module({
	imports: [
		CampaignCoreModule,
		CampaignItemCoreModule,
		TenantCoreModule,
		AuditCoreModule,
	],
	controllers: [CampaignTenantController, CampaignSelfController],
	providers: [CampaignFeatureService],
})
export class CampaignFeatureModule {}
