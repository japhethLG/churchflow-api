import { ApiProperty } from "@nestjs/swagger";
import { AMOUNT_EXAMPLE, ID_EXAMPLE } from "@shared/dto-examples";
import { Expose, Type } from "class-transformer";

export class MemberGivingTrendItemDto {
	@Expose()
	@ApiProperty({ example: ID_EXAMPLE })
	memberId!: string;

	@Expose()
	@ApiProperty({
		type: [Number],
		example: [0, 0, AMOUNT_EXAMPLE],
		description:
			"Total given per month, aligned index-for-index with `months`.",
	})
	monthlyTotals!: number[];
}

// Per-member monthly giving series for the members-list sparklines.
export class MemberGivingTrendResponseDto {
	@Expose()
	@ApiProperty({
		type: [String],
		example: ["2026-04", "2026-05"],
		description: "Chronological YYYY-MM axis shared by every item.",
	})
	months!: string[];

	@Expose()
	@Type(() => MemberGivingTrendItemDto)
	@ApiProperty({ type: [MemberGivingTrendItemDto] })
	items!: MemberGivingTrendItemDto[];
}
