import { Global, Module } from '@nestjs/common';

import { PrismaClientModule } from '@infrastructure/prisma-client/prisma-client.module';

import { FirebaseAdminService } from './firebase-admin.service';
import { FirebaseAuthGuard } from './guards/firebase-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { TenantGuard } from './guards/tenant.guard';
import { UserClaimsService } from './user-claims.service';

@Global()
@Module({
  imports: [PrismaClientModule],
  providers: [
    FirebaseAdminService,
    FirebaseAuthGuard,
    RolesGuard,
    TenantGuard,
    UserClaimsService,
  ],
  exports: [
    FirebaseAdminService,
    FirebaseAuthGuard,
    RolesGuard,
    TenantGuard,
    UserClaimsService,
  ],
})
export class FirebaseAuthModule {}
