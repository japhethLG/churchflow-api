import { ApiProperty } from "@nestjs/swagger";
import { MetaDto } from "@shared/dto/meta.dto";
import { AMOUNT_EXAMPLE } from "@shared/dto-examples";
import { Expose } from "class-transformer";

export class MyTransactionListMetaDto extends MetaDto {
	@Expose()
	@ApiProperty({
		example: AMOUNT_EXAMPLE,
		description:
			"Sum of amounts across the caller's matching transactions",
	})
	sum!: number;
}
