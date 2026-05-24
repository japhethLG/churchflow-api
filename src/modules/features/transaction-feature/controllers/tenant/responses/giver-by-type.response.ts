import { ApiProperty } from "@nestjs/swagger";
import { TransactionType } from "@prisma/client";
import { AMOUNT_EXAMPLE } from "@shared/dto-examples";
import { Expose } from "class-transformer";

export class GiverByTypeDto {
	@Expose()
	@ApiProperty({ enum: TransactionType })
	type!: TransactionType;

	@Expose()
	@ApiProperty({ example: AMOUNT_EXAMPLE })
	amount!: number;

	@Expose()
	@ApiProperty({ example: 5 })
	count!: number;

	@Expose()
	@ApiProperty({
		example: 0.6,
		description: "Fraction of this giver's total in this type (0..1).",
	})
	share!: number;
}
