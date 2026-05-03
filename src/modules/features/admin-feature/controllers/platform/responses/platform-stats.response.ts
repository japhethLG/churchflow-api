import { ApiProperty } from "@nestjs/swagger";
import { AMOUNT_EXAMPLE, INT_EXAMPLE } from "@shared/dto-examples";
import { Expose } from "class-transformer";

export class PlatformStatsDto {
	@Expose()
	@ApiProperty({
		example: INT_EXAMPLE,
		description: "Total non-deleted tenants",
	})
	totalTenants!: number;

	@Expose()
	@ApiProperty({
		example: INT_EXAMPLE,
		description: "Tenants created in the current calendar month",
	})
	createdThisMonth!: number;

	@Expose()
	@ApiProperty({
		example: INT_EXAMPLE,
		description: "Total non-deleted super-admin users",
	})
	superAdmins!: number;

	@Expose()
	@ApiProperty({
		example: INT_EXAMPLE,
		description: "Total members with ADMIN role across all tenants",
	})
	totalAdmins!: number;

	@Expose()
	@ApiProperty({
		example: INT_EXAMPLE,
		description: "Total non-deleted members across all tenants",
	})
	totalMembers!: number;

	@Expose()
	@ApiProperty({
		example: INT_EXAMPLE,
		description: "New members in the current calendar month",
	})
	newMembersThisMonth!: number;

	@Expose()
	@ApiProperty({
		example: INT_EXAMPLE,
		description: "Gift transactions in the last 30 days",
	})
	giftsLast30dCount!: number;

	@Expose()
	@ApiProperty({
		example: AMOUNT_EXAMPLE,
		description: "Total gift amount in the last 30 days",
	})
	giftsLast30dTotal!: number;
}
