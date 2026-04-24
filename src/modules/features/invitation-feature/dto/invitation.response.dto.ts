import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

import { InvitationDto } from '@shared/dto/invitation.dto';

export class InvitationResponseDto extends InvitationDto {}

export class InvitationListResponseDto {
  @Expose()
  @Type(() => InvitationResponseDto)
  @ApiProperty({ type: [InvitationResponseDto] })
  items!: InvitationResponseDto[];
}
