import { ApiProperty } from "@nestjs/swagger";
import { AMOUNT_EXAMPLE, ID_EXAMPLE } from "@shared/dto-examples";
import { Expose, Type } from "class-transformer";

export class CampaignProgressBatchEntryDto {
	@Expose()
	@ApiProperty({ example: ID_EXAMPLE })
	campaignId!: string;

	@Expose()
	@ApiProperty({
		example: AMOUNT_EXAMPLE,
		description: "Sum of campaign-item targetAmounts.",
	})
	goalAmount!: number;

	@Expose()
	@ApiProperty({ example: AMOUNT_EXAMPLE })
	pledgedAmount!: number;

	@Expose()
	@ApiProperty({ example: AMOUNT_EXAMPLE })
	raisedAmount!: number;

	@Expose()
	@ApiProperty({ example: 12 })
	pledgeCount!: number;
}

export class CampaignProgressBatchResponseDto {
	@Expose()
	@Type(() => CampaignProgressBatchEntryDto)
	@ApiProperty({
		type: [CampaignProgressBatchEntryDto],
		description:
			"One entry per requested campaign id, in the same order. Missing campaigns are returned with zeros.",
	})
	items!: CampaignProgressBatchEntryDto[];
}
