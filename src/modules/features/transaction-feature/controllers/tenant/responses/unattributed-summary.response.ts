import { ApiProperty } from "@nestjs/swagger";
import { AMOUNT_EXAMPLE } from "@shared/dto-examples";
import { Expose } from "class-transformer";

export class UnattributedSummaryResponseDto {
	@Expose()
	@ApiProperty({
		example: 7,
		description: "Transactions in the window with no memberId.",
	})
	anonymousCount!: number;

	@Expose()
	@ApiProperty({ example: AMOUNT_EXAMPLE })
	anonymousTotal!: number;

	@Expose()
	@ApiProperty({
		example: 3,
		description: "Transactions in the window with no campaignId.",
	})
	noCampaignCount!: number;

	@Expose()
	@ApiProperty({ example: AMOUNT_EXAMPLE })
	noCampaignTotal!: number;
}
