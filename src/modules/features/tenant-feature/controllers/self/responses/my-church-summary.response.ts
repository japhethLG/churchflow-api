import { ApiProperty } from "@nestjs/swagger";
import { AMOUNT_EXAMPLE } from "@shared/dto-examples";
import { Expose, Type } from "class-transformer";

import { MyChurchSummaryByTypeDto } from "./my-church-summary-by-type.response";

// Aggregate, members-safe snapshot of the church's current giving + activity.
// Only aggregate counts and sums — no per-row reads of other members'
// transactions or pledges. Drives the dashboard's "church pulse" strip.
export class MyChurchSummaryResponseDto {
	@Expose()
	@ApiProperty({ example: AMOUNT_EXAMPLE })
	receivedThisMonth!: number;

	@Expose()
	@ApiProperty({ example: 42 })
	receivedThisMonthCount!: number;

	@Expose()
	@ApiProperty({ example: AMOUNT_EXAMPLE })
	receivedYearToDate!: number;

	@Expose()
	@ApiProperty({ example: AMOUNT_EXAMPLE })
	receivedLastMonth!: number;

	@Expose()
	@Type(() => MyChurchSummaryByTypeDto)
	@ApiProperty({ type: [MyChurchSummaryByTypeDto] })
	byTypeThisMonth!: MyChurchSummaryByTypeDto[];

	@Expose()
	@ApiProperty({ example: 3 })
	activeCampaignCount!: number;

	@Expose()
	@ApiProperty({ example: 1 })
	upcomingCampaignCount!: number;

	@Expose()
	@ApiProperty({ example: 124 })
	memberCount!: number;

	@Expose()
	@ApiProperty({ example: 4 })
	newMembersThisMonth!: number;
}
