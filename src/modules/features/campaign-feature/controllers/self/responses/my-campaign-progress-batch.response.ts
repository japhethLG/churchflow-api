import { ApiProperty } from "@nestjs/swagger";
import { AMOUNT_EXAMPLE, ID_EXAMPLE, INT_EXAMPLE } from "@shared/dto-examples";
import { Expose, Type } from "class-transformer";

// Compact per-campaign progress entry (no per-item breakdown) — the
// member dashboard/campaign cards only render the goal/pledged/raised
// bars, so the batch endpoint stays light.
export class MyCampaignProgressBatchEntryDto {
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
	@ApiProperty({ example: AMOUNT_EXAMPLE })
	pledgedAmount!: number;

	@Expose()
	@ApiProperty({ example: AMOUNT_EXAMPLE })
	raisedAmount!: number;

	@Expose()
	@ApiProperty({ example: INT_EXAMPLE })
	pledgeCount!: number;
}

export class MyCampaignProgressBatchResponseDto {
	@Expose()
	@Type(() => MyCampaignProgressBatchEntryDto)
	@ApiProperty({
		type: [MyCampaignProgressBatchEntryDto],
		description:
			"One entry per requested campaign id, in the same order. Missing campaigns are returned with zeros.",
	})
	items!: MyCampaignProgressBatchEntryDto[];
}
