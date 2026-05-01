import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

import { CampaignStatus } from '@prisma/client';

import {
  AMOUNT_EXAMPLE,
  CAMPAIGN_DESCRIPTION_EXAMPLE,
  CAMPAIGN_ITEM_TITLE_EXAMPLE,
  CAMPAIGN_TITLE_EXAMPLE,
  DATE_UTC_EXAMPLE,
  INT_EXAMPLE,
} from '@shared/dto-examples';

export class CreateCampaignRequestDto {
  @ApiProperty({ example: CAMPAIGN_TITLE_EXAMPLE })
  @IsString()
  title!: string;

  @ApiPropertyOptional({ example: CAMPAIGN_DESCRIPTION_EXAMPLE })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    example: DATE_UTC_EXAMPLE,
    description: 'Omit for open-ended campaigns',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  deadline?: Date;

  @ApiPropertyOptional({ enum: CampaignStatus })
  @IsOptional()
  @IsEnum(CampaignStatus)
  status?: CampaignStatus;
}

export class UpdateCampaignRequestDto extends PartialType(CreateCampaignRequestDto) {}

export class CampaignFiltersRequestDto {
  @ApiPropertyOptional({ enum: CampaignStatus })
  @IsOptional()
  @IsEnum(CampaignStatus)
  status?: CampaignStatus;

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

export class CreateCampaignItemRequestDto {
  @ApiProperty({ example: CAMPAIGN_ITEM_TITLE_EXAMPLE })
  @IsString()
  title!: string;

  @ApiPropertyOptional({ example: CAMPAIGN_DESCRIPTION_EXAMPLE })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: AMOUNT_EXAMPLE })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  targetAmount!: number;

  @ApiPropertyOptional({
    example: DATE_UTC_EXAMPLE,
    description: 'Defaults to the campaign deadline when omitted',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  deadline?: Date;

  @ApiPropertyOptional({ example: INT_EXAMPLE })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateCampaignItemRequestDto extends PartialType(
  CreateCampaignItemRequestDto,
) {}
