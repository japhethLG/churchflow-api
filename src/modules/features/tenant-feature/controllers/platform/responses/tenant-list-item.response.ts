import { ApiProperty } from "@nestjs/swagger";
import { TenantDto } from "@shared/dto/tenant.dto";
import { AMOUNT_EXAMPLE, INT_EXAMPLE } from "@shared/dto-examples";
import { Expose, Type } from "class-transformer";

import { TenantAdminPreviewDto } from "./tenant-admin-preview.response";

export class TenantListItemDto extends TenantDto {
	@Expose()
	@ApiProperty({
		example: INT_EXAMPLE,
		description: "Number of members with ADMIN role",
	})
	adminCount!: number;

	@Expose()
	@ApiProperty({
		example: INT_EXAMPLE,
		description: "Total non-deleted members",
	})
	memberCount!: number;

	@Expose()
	@Type(() => TenantAdminPreviewDto)
	@ApiProperty({
		type: [TenantAdminPreviewDto],
		description: "Up to 3 admin previews for avatar stack",
	})
	adminsPreview!: TenantAdminPreviewDto[];

	@Expose()
	@ApiProperty({
		example: INT_EXAMPLE,
		description: "Gift transactions in the current calendar month",
	})
	giftsMtdCount!: number;

	@Expose()
	@ApiProperty({
		example: AMOUNT_EXAMPLE,
		description: "Total gift amount in the current calendar month",
	})
	giftsMtdTotal!: number;
}
