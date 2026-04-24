import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

import { MemberDto } from '@shared/dto/member.dto';
import { MetaDto } from '@shared/dto/meta.dto';

export class MemberResponseDto extends MemberDto {}

export class MemberListResponseDto {
  @Expose()
  @Type(() => MemberResponseDto)
  @ApiProperty({ type: [MemberResponseDto] })
  items!: MemberResponseDto[];

  @Expose()
  @Type(() => MetaDto)
  @ApiProperty({ type: MetaDto })
  meta!: MetaDto;
}
