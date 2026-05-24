import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
	AMOUNT_EXAMPLE,
	DATE_UTC_EXAMPLE,
	FIRST_NAME_EXAMPLE,
	ID_EXAMPLE,
	LAST_NAME_EXAMPLE,
} from "@shared/dto-examples";
import { Expose, Type } from "class-transformer";

import { GiverByCampaignDto } from "./giver-by-campaign.response";
import { GiverByTypeDto } from "./giver-by-type.response";
import { GiverMonthlyDto } from "./giver-monthly.response";

export class GiverRowDto {
	@Expose()
	@ApiProperty({ example: ID_EXAMPLE })
	memberId!: string;

	@Expose()
	@ApiProperty({ example: FIRST_NAME_EXAMPLE })
	memberFirstName!: string;

	@Expose()
	@ApiProperty({ example: LAST_NAME_EXAMPLE })
	memberLastName!: string;

	@Expose()
	@ApiPropertyOptional({
		example: DATE_UTC_EXAMPLE,
		nullable: true,
		description: "Set when the member has been archived.",
	})
	memberDeletedAt!: string | null;

	@Expose()
	@ApiProperty({ example: AMOUNT_EXAMPLE })
	total!: number;

	@Expose()
	@ApiProperty({ example: 12 })
	count!: number;

	@Expose()
	@ApiProperty({ example: AMOUNT_EXAMPLE, description: "total / count" })
	avg!: number;

	@Expose()
	@Type(() => GiverByTypeDto)
	@ApiProperty({ type: [GiverByTypeDto] })
	byType!: GiverByTypeDto[];

	@Expose()
	@Type(() => GiverByCampaignDto)
	@ApiProperty({ type: [GiverByCampaignDto] })
	byCampaign!: GiverByCampaignDto[];

	@Expose()
	@Type(() => GiverMonthlyDto)
	@ApiProperty({
		type: [GiverMonthlyDto],
		description: "One bucket per month in the requested date range.",
	})
	monthlyTotals!: GiverMonthlyDto[];
}
