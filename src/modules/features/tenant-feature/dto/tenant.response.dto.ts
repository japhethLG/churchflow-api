import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

import { TenantDto } from '@shared/dto/tenant.dto';
import {
  AMOUNT_EXAMPLE,
  FULL_NAME_EXAMPLE,
  ID_EXAMPLE,
  INT_EXAMPLE,
  URL_EXAMPLE,
} from '@shared/dto-examples';

export class TenantResponseDto extends TenantDto {}

// Preview of one admin shown in the tenant list table.
export class TenantAdminPreviewDto {
  @Expose()
  @ApiProperty({ example: ID_EXAMPLE })
  memberId!: string;

  @Expose()
  @ApiProperty({ example: FULL_NAME_EXAMPLE })
  displayName!: string;

  @Expose()
  @ApiPropertyOptional({ example: URL_EXAMPLE, nullable: true })
  photoUrl!: string | null;
}

// Enriched row for the super-admin tenants list.
export class TenantListItemDto extends TenantDto {
  @Expose()
  @ApiProperty({ example: INT_EXAMPLE, description: 'Number of members with ADMIN role' })
  adminCount!: number;

  @Expose()
  @ApiProperty({ example: INT_EXAMPLE, description: 'Total non-deleted members' })
  memberCount!: number;

  @Expose()
  @Type(() => TenantAdminPreviewDto)
  @ApiProperty({ type: [TenantAdminPreviewDto], description: 'Up to 3 admin previews for avatar stack' })
  adminsPreview!: TenantAdminPreviewDto[];

  @Expose()
  @ApiProperty({ example: INT_EXAMPLE, description: 'Gift transactions in the current calendar month' })
  giftsMtdCount!: number;

  @Expose()
  @ApiProperty({ example: AMOUNT_EXAMPLE, description: 'Total gift amount in the current calendar month' })
  giftsMtdTotal!: number;

}

export class TenantListResponseDto {
  @Expose()
  @Type(() => TenantListItemDto)
  @ApiProperty({ type: [TenantListItemDto] })
  items!: TenantListItemDto[];
}
