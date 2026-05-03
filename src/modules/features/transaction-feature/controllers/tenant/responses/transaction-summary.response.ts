import { ApiProperty } from "@nestjs/swagger";
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
	@Type(() => TransactionSummaryByTypeDto)
	@ApiProperty({ type: [TransactionSummaryByTypeDto] })
	byType!: TransactionSummaryByTypeDto[];

	@Expose()
	@Type(() => TransactionSummaryByMonthDto)
	@ApiProperty({ type: [TransactionSummaryByMonthDto] })
	byMonth!: TransactionSummaryByMonthDto[];
}
