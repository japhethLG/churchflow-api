import { ApiProperty } from "@nestjs/swagger";
import { Expose, Type } from "class-transformer";

import { TransactionListMetaDto } from "./transaction-list-meta.response";
import { TransactionResponseDto } from "./transaction.response";

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
