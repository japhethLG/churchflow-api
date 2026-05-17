import { AuthorizationModule } from "@infrastructure/authorization";
import { EmailModule } from "@infrastructure/email/email.module";
import { FirebaseAuthModule } from "@infrastructure/firebase-auth/firebase-auth.module";
import { FirebaseAuthGuard } from "@infrastructure/firebase-auth/guards/firebase-auth.guard";
import { RolesGuard } from "@infrastructure/firebase-auth/guards/roles.guard";
import { PrismaClientModule } from "@infrastructure/prisma-client/prisma-client.module";
import { AuditCoreModule } from "@modules/core/audit/audit.module";
import { CampaignCoreModule } from "@modules/core/campaign/campaign.module";
import { CampaignItemCoreModule } from "@modules/core/campaign-item/campaign-item.module";
import { InvitationCoreModule } from "@modules/core/invitation/invitation.module";
import { MemberCoreModule } from "@modules/core/member/member.module";
import { PledgeCoreModule } from "@modules/core/pledge/pledge.module";
import { TenantCoreModule } from "@modules/core/tenant/tenant.module";
import { TransactionCoreModule } from "@modules/core/transaction/transaction.module";
import { UserCoreModule } from "@modules/core/user/user.module";
import { AdminFeatureModule } from "@modules/features/admin-feature/admin-feature.module";
import { AuditFeatureModule } from "@modules/features/audit-feature/audit-feature.module";
import { AuthFeatureModule } from "@modules/features/auth-feature/auth-feature.module";
import { CampaignFeatureModule } from "@modules/features/campaign-feature/campaign-feature.module";
import { InvitationFeatureModule } from "@modules/features/invitation-feature/invitation-feature.module";
import { MemberFeatureModule } from "@modules/features/member-feature/member-feature.module";
import { PledgeFeatureModule } from "@modules/features/pledge-feature/pledge-feature.module";
import { TenantFeatureModule } from "@modules/features/tenant-feature/tenant-feature.module";
import { TransactionFeatureModule } from "@modules/features/transaction-feature/transaction-feature.module";
import { InvitationProcessingModule } from "@modules/processes/invitation-processing/invitation-processing.module";
import { MemberMergingModule } from "@modules/processes/member-merging/member-merging.module";
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";

import { MainController } from "./main.controller";

const infrastructureModules = [
	PrismaClientModule,
	FirebaseAuthModule,
	EmailModule,
	AuthorizationModule,
];

const coreModules = [
	UserCoreModule,
	TenantCoreModule,
	MemberCoreModule,
	CampaignCoreModule,
	CampaignItemCoreModule,
	PledgeCoreModule,
	TransactionCoreModule,
	InvitationCoreModule,
	AuditCoreModule,
];

const processModules = [InvitationProcessingModule, MemberMergingModule];

const featureModules = [
	AdminFeatureModule,
	AuditFeatureModule,
	AuthFeatureModule,
	TenantFeatureModule,
	MemberFeatureModule,
	CampaignFeatureModule,
	PledgeFeatureModule,
	TransactionFeatureModule,
	InvitationFeatureModule,
];

@Module({
	imports: [
		ConfigModule.forRoot({ isGlobal: true, expandVariables: true }),
		...infrastructureModules,
		...coreModules,
		...processModules,
		...featureModules,
	],
	controllers: [MainController],
	providers: [
		{ provide: APP_GUARD, useClass: FirebaseAuthGuard },
		{ provide: APP_GUARD, useClass: RolesGuard },
	],
})
export class MainModule {}
