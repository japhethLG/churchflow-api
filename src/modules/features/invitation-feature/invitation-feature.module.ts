import { Module } from '@nestjs/common';

import { InvitationProcessingModule } from '@modules/processes/invitation-processing/invitation-processing.module';

import { InvitationController } from './controllers/invitation.controller';

@Module({
  imports: [InvitationProcessingModule],
  controllers: [InvitationController],
})
export class InvitationFeatureModule {}
