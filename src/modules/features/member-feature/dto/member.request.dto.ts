import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

import { MemberRole, MemberStatus } from '@prisma/client';

import {
  ADDRESS_EXAMPLE,
  EMAIL_EXAMPLE,
  FIRST_NAME_EXAMPLE,
  LAST_NAME_EXAMPLE,
  PHONE_NUMBER_EXAMPLE,
} from '@shared/dto-examples';

export class CreateMemberRequestDto {
  @ApiProperty({ example: FIRST_NAME_EXAMPLE })
  @IsString()
  firstName!: string;

  @ApiProperty({ example: LAST_NAME_EXAMPLE })
  @IsString()
  lastName!: string;

  @ApiPropertyOptional({ example: EMAIL_EXAMPLE })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: PHONE_NUMBER_EXAMPLE })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: ADDRESS_EXAMPLE })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ enum: MemberRole, default: MemberRole.USER })
  @IsOptional()
  @IsEnum(MemberRole)
  role?: MemberRole;
}

export class UpdateMemberRequestDto extends PartialType(CreateMemberRequestDto) {
  @ApiPropertyOptional({ enum: MemberStatus })
  @IsOptional()
  @IsEnum(MemberStatus)
  status?: MemberStatus;
}

export class MemberFiltersRequestDto {
  @ApiPropertyOptional({ enum: MemberStatus })
  @IsOptional()
  @IsEnum(MemberStatus)
  status?: MemberStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

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
