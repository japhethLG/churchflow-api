import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { AMOUNT_EXAMPLE } from "@shared/dto-examples";
import { Expose, Type } from "class-transformer";

import { TransactionSummaryByMonthDto } from "./transaction-summary-by-month.response";
import { TransactionSummaryByTypeDto } from "./transaction-summary-by-type.response";

export class TransactionSummaryResponseDto {
	@Expose()
	@ApiProperty({
		example: AMOUNT_EXAMPLE,
		description: "Total across the entire window",
	})
	total!: number;

	@Expose()
	@ApiProperty({
		example: 42,
		description: "Number of transactions in the window",
	})
	count!: number;

	@Expose()
	@ApiProperty({
		example: AMOUNT_EXAMPLE,
		description: "Average gift amount across the window (total / count).",
	})
	avg!: number;

	@Expose()
	@ApiPropertyOptional({
		type: String,
		example: "2026-01-15T00:00:00.000Z",
		nullable: true,
		description:
			"Date of the earliest transaction in the window. Null when no transactions match.",
	})
	firstDate!: string | null;

	@Expose()
	@ApiPropertyOptional({
		type: String,
		example: "2026-05-15T00:00:00.000Z",
		nullable: true,
		description:
			"Date of the latest transaction in the window. Null when no transactions match.",
	})
	lastDate!: string | null;

	@Expose()
	@Type(() => TransactionSummaryByTypeDto)
	@ApiProperty({ type: [TransactionSummaryByTypeDto] })
	byType!: TransactionSummaryByTypeDto[];

	@Expose()
	@Type(() => TransactionSummaryByMonthDto)
	@ApiProperty({ type: [TransactionSummaryByMonthDto] })
	byMonth!: TransactionSummaryByMonthDto[];
}
