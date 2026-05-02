import { ApiProperty } from "@nestjs/swagger";
import { TransactionType } from "@prisma/client";
import { MetaDto } from "@shared/dto/meta.dto";
import { TransactionDto } from "@shared/dto/transaction.dto";
import { AMOUNT_EXAMPLE } from "@shared/dto-examples";
import { Expose, Type } from "class-transformer";

export class TransactionResponseDto extends TransactionDto {}

export class TransactionListMetaDto extends MetaDto {
	@Expose()
	@ApiProperty({
		example: AMOUNT_EXAMPLE,
		description: "Sum of amounts in the current filter",
	})
	sum!: number;
}

export class TransactionListResponseDto {
	@Expose()
	@Type(() => TransactionResponseDto)
	@ApiProperty({ type: [TransactionResponseDto] })
	items!: TransactionResponseDto[];

	@Expose()
	@Type(() => TransactionListMetaDto)
	@ApiProperty({ type: TransactionListMetaDto })
	meta!: TransactionListMetaDto;
}

// Aggregations for the admin dashboard.
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

export class TransactionSummaryByMonthDto {
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
