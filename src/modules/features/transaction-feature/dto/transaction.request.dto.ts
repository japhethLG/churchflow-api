import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

import { TransactionType } from '@prisma/client';


import {
  AMOUNT_EXAMPLE,
  DATE_UTC_EXAMPLE,
  ID_EXAMPLE,
  REFERENCE_NUMBER_EXAMPLE,
  STRING_EXAMPLE,
} from '@shared/dto-examples';

export class CreateTransactionRequestDto {
  @ApiProperty({ enum: TransactionType, example: TransactionType.TITHE })
  @IsEnum(TransactionType)
  type!: TransactionType;

  @ApiProperty({ example: AMOUNT_EXAMPLE })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount!: number;

  @ApiProperty({ example: DATE_UTC_EXAMPLE })
  @Type(() => Date)
  @IsDate()
  date!: Date;

  @ApiPropertyOptional({ example: ID_EXAMPLE })
  @IsOptional()
  @IsString()
  memberId?: string;

  @ApiPropertyOptional({
    example: ID_EXAMPLE,
    description: 'Campaign this gift is attributed to',
  })
  @IsOptional()
  @IsString()
  campaignId?: string;

  @ApiPropertyOptional({
    example: ID_EXAMPLE,
    description: 'Campaign item earmark. Must belong to campaignId when both are set.',
  })
  @IsOptional()
  @IsString()
  campaignItemId?: string;

  @ApiPropertyOptional({
    example: ID_EXAMPLE,
    description:
      'Pledge this payment fulfills. When set, campaignId and campaignItemId must match the pledge.',
  })
  @IsOptional()
  @IsString()
  pledgeId?: string;

  @ApiPropertyOptional({ example: STRING_EXAMPLE })
  @IsOptional()
  @IsString()
  customType?: string;

  @ApiPropertyOptional({ example: STRING_EXAMPLE })
  @IsOptional()
  @IsString()
  note?: string;

  @ApiPropertyOptional({ example: REFERENCE_NUMBER_EXAMPLE })
  @IsOptional()
  @IsString()
  referenceNumber?: string;
}

export class UpdateTransactionRequestDto extends PartialType(CreateTransactionRequestDto) {}

export class TransactionFiltersRequestDto {
  @ApiPropertyOptional({ example: ID_EXAMPLE })
  @IsOptional()
  @IsString()
  memberId?: string;

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
  pledgeId?: string;

  @ApiPropertyOptional({ enum: TransactionType })
  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType;

  @ApiPropertyOptional({ example: DATE_UTC_EXAMPLE })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dateFrom?: Date;

  @ApiPropertyOptional({ example: DATE_UTC_EXAMPLE })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dateTo?: Date;

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
