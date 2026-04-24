import { Module } from '@nestjs/common';

import { MemberRepository } from './repository/member.repository';
import { MemberService } from './services/member.service';

@Module({
  providers: [MemberRepository, MemberService],
  exports: [MemberService],
})
export class MemberCoreModule {}
