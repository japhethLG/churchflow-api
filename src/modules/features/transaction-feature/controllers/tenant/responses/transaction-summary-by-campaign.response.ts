import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
	AMOUNT_EXAMPLE,
	CAMPAIGN_TITLE_EXAMPLE,
	DATE_UTC_EXAMPLE,
	ID_EXAMPLE,
} from "@shared/dto-examples";
import { Expose } from "class-transformer";

export class TransactionSummaryByCampaignDto {
	@Expose()
	@ApiPropertyOptional({
		type: String,
		example: ID_EXAMPLE,
		nullable: true,
		description:
			"Null when the gifts in this bucket were not attributed to any campaign.",
	})
	campaignId!: string | null;

	@Expose()
	@ApiProperty({
		example: CAMPAIGN_TITLE_EXAMPLE,
		description:
			'Campaign title at the time of the request, or "No campaign" for the unattributed bucket.',
	})
	campaignTitle!: string;

	@Expose()
	@ApiPropertyOptional({
		type: String,
		example: DATE_UTC_EXAMPLE,
		nullable: true,
		description: "Set when the referenced campaign has been archived.",
	})
	campaignDeletedAt!: string | null;

	@Expose()
	@ApiProperty({ example: AMOUNT_EXAMPLE })
	total!: number;

	@Expose()
	@ApiProperty({ example: 12 })
	count!: number;
}
