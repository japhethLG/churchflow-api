import { ApiProperty } from "@nestjs/swagger";
import { AMOUNT_EXAMPLE } from "@shared/dto-examples";
import { Expose } from "class-transformer";

export class MyTransactionSummaryByMonthDto {
	@Expose()
	@ApiProperty({ example: "2026-04", description: "YYYY-MM UTC bucket" })
	month!: string;

	@Expose()
	@ApiProperty({ example: AMOUNT_EXAMPLE })
	total!: number;

	@Expose()
	@ApiProperty({ example: 5 })
	count!: number;
}
