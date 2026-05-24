import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { AMOUNT_EXAMPLE, DATE_UTC_EXAMPLE } from "@shared/dto-examples";
import { Expose } from "class-transformer";

// Aggregate snapshot powering the admin Member Detail overview.
// Computed server-side so the page no longer pulls 500 transactions /
// 200 pledges and re-aggregates in JS.
export class MemberSummaryResponseDto {
	@Expose()
	@ApiProperty({
		example: AMOUNT_EXAMPLE,
		description: "Sum of all the member's transactions (all time).",
	})
	lifetimeGiving!: number;

	@Expose()
	@ApiProperty({ example: 42 })
	transactionCount!: number;

	@Expose()
	@ApiProperty({
		example: AMOUNT_EXAMPLE,
		description: "lifetimeGiving / transactionCount",
	})
	avgGift!: number;

	@Expose()
	@ApiPropertyOptional({
		type: String,
		example: DATE_UTC_EXAMPLE,
		nullable: true,
	})
	firstGiftDate!: string | null;

	@Expose()
	@ApiPropertyOptional({
		type: String,
		example: DATE_UTC_EXAMPLE,
		nullable: true,
	})
	lastGiftDate!: string | null;

	@Expose()
	@ApiProperty({ example: 3 })
	activePledgesCount!: number;

	@Expose()
	@ApiProperty({ example: 5 })
	fulfilledPledgesCount!: number;

	@Expose()
	@ApiProperty({ example: 1 })
	cancelledPledgesCount!: number;

	@Expose()
	@ApiProperty({ example: AMOUNT_EXAMPLE })
	pledgedTotal!: number;

	@Expose()
	@ApiProperty({ example: AMOUNT_EXAMPLE })
	paidTotal!: number;

	@Expose()
	@ApiProperty({
		example: 0.75,
		description: "paidTotal / pledgedTotal (0..1).",
	})
	pledgeFulfillmentPct!: number;
}
