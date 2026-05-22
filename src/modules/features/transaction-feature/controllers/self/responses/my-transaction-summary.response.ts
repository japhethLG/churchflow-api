import { ApiProperty } from "@nestjs/swagger";
import { AMOUNT_EXAMPLE } from "@shared/dto-examples";
import { Expose, Type } from "class-transformer";

import { MyTransactionSummaryByMonthDto } from "./my-transaction-summary-by-month.response";
import { MyTransactionSummaryByTypeDto } from "./my-transaction-summary-by-type.response";

// Aggregate snapshot of the caller's own giving — scoped to the
// authenticated member server-side via tenant.memberId. Identical shape
// to the admin TransactionSummaryResponseDto, but every field here
// reflects the caller's transactions only.
export class MyTransactionSummaryResponseDto {
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
	@Type(() => MyTransactionSummaryByTypeDto)
	@ApiProperty({ type: [MyTransactionSummaryByTypeDto] })
	byType!: MyTransactionSummaryByTypeDto[];

	@Expose()
	@Type(() => MyTransactionSummaryByMonthDto)
	@ApiProperty({ type: [MyTransactionSummaryByMonthDto] })
	byMonth!: MyTransactionSummaryByMonthDto[];
}
