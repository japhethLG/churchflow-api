import { ApiProperty } from "@nestjs/swagger";
import { TransactionType } from "@prisma/client";
import { AMOUNT_EXAMPLE } from "@shared/dto-examples";
import { Expose } from "class-transformer";

export class TransactionSummaryByTypeDto {
	@Expose()
	@ApiProperty({ enum: TransactionType })
	type!: TransactionType;

	@Expose()
	@ApiProperty({ example: AMOUNT_EXAMPLE })
	total!: number;

	@Expose()
	@ApiProperty({ example: 12 })
	count!: number;
}
