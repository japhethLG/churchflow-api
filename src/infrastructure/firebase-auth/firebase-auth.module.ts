import { PrismaClientModule } from "@infrastructure/prisma-client/prisma-client.module";
import { Global, Module } from "@nestjs/common";

import { FirebaseAdminService } from "./firebase-admin.service";
import { FirebaseAuthGuard } from "./guards/firebase-auth.guard";
import { RolesGuard } from "./guards/roles.guard";
import { TenantGuard } from "./guards/tenant.guard";
import { TenantResolverService } from "./tenant-resolver.service";
import { UserClaimsService } from "./user-claims.service";

@Global()
@Module({
	imports: [PrismaClientModule],
	providers: [
		FirebaseAdminService,
		FirebaseAuthGuard,
		RolesGuard,
		TenantGuard,
		TenantResolverService,
		UserClaimsService,
	],
	exports: [
		FirebaseAdminService,
		FirebaseAuthGuard,
		RolesGuard,
		TenantGuard,
		TenantResolverService,
		UserClaimsService,
	],
})
export class FirebaseAuthModule {}
