import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
	AMOUNT_EXAMPLE,
	CAMPAIGN_TITLE_EXAMPLE,
	DATE_UTC_EXAMPLE,
	ID_EXAMPLE,
} from "@shared/dto-examples";
import { Expose } from "class-transformer";

export class GiverByCampaignDto {
	@Expose()
	@ApiProperty({
		example: ID_EXAMPLE,
		description:
			"Empty string when the gift was not attributed to any campaign.",
	})
	campaignId!: string;

	@Expose()
	@ApiProperty({ example: CAMPAIGN_TITLE_EXAMPLE })
	campaignTitle!: string;

	@Expose()
	@ApiPropertyOptional({
		example: DATE_UTC_EXAMPLE,
		nullable: true,
		description: "Set when the referenced campaign has been archived.",
	})
	campaignDeletedAt!: string | null;

	@Expose()
	@ApiProperty({ example: AMOUNT_EXAMPLE })
	amount!: number;

	@Expose()
	@ApiProperty({
		example: 0.4,
		description: "Fraction of this giver's total in this campaign (0..1).",
	})
	share!: number;
}
