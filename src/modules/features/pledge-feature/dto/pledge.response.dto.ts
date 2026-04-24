import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

import { AMOUNT_EXAMPLE } from '@shared/dto-examples';
import { MetaDto } from '@shared/dto/meta.dto';
import { PledgeDto } from '@shared/dto/pledge.dto';

export class PledgeResponseDto extends PledgeDto {}

export class PledgeListMetaDto extends MetaDto {
  @Expose()
  @ApiProperty({
    example: AMOUNT_EXAMPLE,
    description: 'Sum of pledgedAmount in the current filter',
  })
  sum!: number;
}

export class PledgeListResponseDto {
  @Expose()
  @Type(() => PledgeResponseDto)
  @ApiProperty({ type: [PledgeResponseDto] })
  items!: PledgeResponseDto[];

  @Expose()
  @Type(() => PledgeListMetaDto)
  @ApiProperty({ type: PledgeListMetaDto })
  meta!: PledgeListMetaDto;
}
