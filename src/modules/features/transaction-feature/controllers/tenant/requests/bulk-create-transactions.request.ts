import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
	ArrayMaxSize,
	ArrayMinSize,
	IsArray,
	ValidateNested,
} from "class-validator";

import { CreateTransactionRequestDto } from "./create-transaction.request";

// Multi-gift entry: one member + one date are typically shared across the
// rows, but each row carries its own attribution. The backend records the
// whole batch atomically (see TransactionFeatureService.recordMany).
export class BulkCreateTransactionsRequestDto {
	@ApiProperty({
		type: [CreateTransactionRequestDto],
		minItems: 1,
		maxItems: 50,
		description: "Gifts to record in a single atomic batch.",
	})
	@IsArray()
	@ArrayMinSize(1)
	@ArrayMaxSize(50)
	@ValidateNested({ each: true })
	@Type(() => CreateTransactionRequestDto)
	items!: CreateTransactionRequestDto[];
}
