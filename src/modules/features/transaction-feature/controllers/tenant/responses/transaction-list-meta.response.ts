import { ApiProperty } from "@nestjs/swagger";
import { MetaDto } from "@shared/dto/meta.dto";
import { AMOUNT_EXAMPLE } from "@shared/dto-examples";
import { Expose } from "class-transformer";

export class TransactionListMetaDto extends MetaDto {
	@Expose()
	@ApiProperty({
		example: AMOUNT_EXAMPLE,
		description: "Sum of amounts in the current filter",
	})
	sum!: number;
}
