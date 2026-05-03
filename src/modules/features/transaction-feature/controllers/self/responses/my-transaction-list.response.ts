import { ApiProperty } from "@nestjs/swagger";
import { Expose, Type } from "class-transformer";

import { MyTransactionListMetaDto } from "./my-transaction-list-meta.response";
import { MyTransactionResponseDto } from "./my-transaction.response";

export class MyTransactionListResponseDto {
	@Expose()
	@Type(() => MyTransactionResponseDto)
	@ApiProperty({ type: [MyTransactionResponseDto] })
	items!: MyTransactionResponseDto[];

	@Expose()
	@Type(() => MyTransactionListMetaDto)
	@ApiProperty({ type: MyTransactionListMetaDto })
	meta!: MyTransactionListMetaDto;
}
