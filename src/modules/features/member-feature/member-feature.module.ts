import { Module } from '@nestjs/common';

import { AuditCoreModule } from '@modules/core/audit/audit.module';
import { MemberCoreModule } from '@modules/core/member/member.module';
import { UserCoreModule } from '@modules/core/user/user.module';
import { MemberMergingModule } from '@modules/processes/member-merging/member-merging.module';

import { MemberController } from './controllers/member.controller';
import { MemberFeatureService } from './services/member-feature.service';

@Module({
  imports: [MemberCoreModule, UserCoreModule, AuditCoreModule, MemberMergingModule],
  controllers: [MemberController],
  providers: [MemberFeatureService],
})
export class MemberFeatureModule {}
