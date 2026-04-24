import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

import { TenantDto } from '@shared/dto/tenant.dto';

export class TenantResponseDto extends TenantDto {}

export class TenantListResponseDto {
  @Expose()
  @Type(() => TenantResponseDto)
  @ApiProperty({ type: [TenantResponseDto] })
  items!: TenantResponseDto[];
}
