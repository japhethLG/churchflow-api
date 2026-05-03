import { AuditCoreModule } from "@modules/core/audit/audit.module";
import { CampaignCoreModule } from "@modules/core/campaign/campaign.module";
import { CampaignItemCoreModule } from "@modules/core/campaign-item/campaign-item.module";
import { MemberCoreModule } from "@modules/core/member/member.module";
import { PledgeCoreModule } from "@modules/core/pledge/pledge.module";
import { TenantCoreModule } from "@modules/core/tenant/tenant.module";
import { TransactionCoreModule } from "@modules/core/transaction/transaction.module";
import { Module } from "@nestjs/common";

import { TransactionSelfController } from "./controllers/self";
import { TransactionTenantController } from "./controllers/tenant";
import { TransactionFeatureService } from "./services/transaction-feature.service";

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
	controllers: [TransactionTenantController, TransactionSelfController],
	providers: [TransactionFeatureService],
})
export class TransactionFeatureModule {}
