import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

import { PledgeStatus } from '@prisma/client';

import {
  AMOUNT_EXAMPLE,
  ID_EXAMPLE,
  STRING_EXAMPLE,
} from '@shared/dto-examples';

export class CreatePledgeRequestDto {
  @ApiProperty({ example: ID_EXAMPLE })
  @IsString()
  campaignId!: string;

  @ApiPropertyOptional({
    example: ID_EXAMPLE,
    description: 'Omit to pledge against the overall campaign, not a specific item',
  })
  @IsOptional()
  @IsString()
  campaignItemId?: string;

  @ApiProperty({ example: ID_EXAMPLE })
  @IsString()
  memberId!: string;

  @ApiProperty({ example: AMOUNT_EXAMPLE })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  pledgedAmount!: number;

  @ApiPropertyOptional({ enum: PledgeStatus })
  @IsOptional()
  @IsEnum(PledgeStatus)
  status?: PledgeStatus;

  @ApiPropertyOptional({ example: STRING_EXAMPLE })
  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdatePledgeRequestDto extends PartialType(CreatePledgeRequestDto) {}

export class PledgeFiltersRequestDto {
  @ApiPropertyOptional({ example: ID_EXAMPLE })
  @IsOptional()
  @IsString()
  campaignId?: string;

  @ApiPropertyOptional({ example: ID_EXAMPLE })
  @IsOptional()
  @IsString()
  campaignItemId?: string;

  @ApiPropertyOptional({ example: ID_EXAMPLE })
  @IsOptional()
  @IsString()
  memberId?: string;

  @ApiPropertyOptional({ enum: PledgeStatus })
  @IsOptional()
  @IsEnum(PledgeStatus)
  status?: PledgeStatus;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;

  @ApiPropertyOptional({ example: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}
