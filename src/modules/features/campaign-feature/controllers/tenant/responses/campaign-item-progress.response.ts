import { ApiProperty } from "@nestjs/swagger";
import { AMOUNT_EXAMPLE, ID_EXAMPLE, INT_EXAMPLE } from "@shared/dto-examples";
import { Expose } from "class-transformer";

export class CampaignItemProgressDto {
	@Expose()
	@ApiProperty({ example: ID_EXAMPLE })
	itemId!: string;

	@Expose()
	@ApiProperty({ example: "Roofing" })
	title!: string;

	@Expose()
	@ApiProperty({ example: AMOUNT_EXAMPLE })
	targetAmount!: number;

	@Expose()
	@ApiProperty({
		example: AMOUNT_EXAMPLE,
		description: "Sum of pledges against this item",
	})
	pledgedAmount!: number;

	@Expose()
	@ApiProperty({
		example: AMOUNT_EXAMPLE,
		description: "Sum of transactions attributed to this item",
	})
	raisedAmount!: number;

	@Expose()
	@ApiProperty({ example: INT_EXAMPLE })
	pledgeCount!: number;
}
