import { ApiProperty } from "@nestjs/swagger";
import { AMOUNT_EXAMPLE, ID_EXAMPLE, INT_EXAMPLE } from "@shared/dto-examples";
import { Expose, Type } from "class-transformer";

import { MyCampaignItemProgressDto } from "./my-campaign-item-progress.response";

export class MyCampaignProgressResponseDto {
	@Expose()
	@ApiProperty({ example: ID_EXAMPLE })
	campaignId!: string;

	@Expose()
	@ApiProperty({
		example: AMOUNT_EXAMPLE,
		description: "Goal = sum of items.targetAmount",
	})
	goalAmount!: number;

	@Expose()
	@ApiProperty({
		example: AMOUNT_EXAMPLE,
		description: "Sum of pledges (items + unscoped campaign pledges)",
	})
	pledgedAmount!: number;

	@Expose()
	@ApiProperty({
		example: AMOUNT_EXAMPLE,
		description: "Sum of transactions attributed to this campaign",
	})
	raisedAmount!: number;

	@Expose()
	@ApiProperty({ example: INT_EXAMPLE, description: "Total active pledges" })
	pledgeCount!: number;

	@Expose()
	@Type(() => MyCampaignItemProgressDto)
	@ApiProperty({ type: [MyCampaignItemProgressDto] })
	items!: MyCampaignItemProgressDto[];
}
