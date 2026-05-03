import { ApiProperty } from "@nestjs/swagger";
import { Expose, Type } from "class-transformer";

import { TenantListItemDto } from "./tenant-list-item.response";

export class TenantListResponseDto {
	@Expose()
	@Type(() => TenantListItemDto)
	@ApiProperty({ type: [TenantListItemDto] })
	items!: TenantListItemDto[];
}
