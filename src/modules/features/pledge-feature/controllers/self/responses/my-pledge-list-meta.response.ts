import { ApiProperty } from "@nestjs/swagger";
import { MetaDto } from "@shared/dto/meta.dto";
import { AMOUNT_EXAMPLE } from "@shared/dto-examples";
import { Expose } from "class-transformer";

export class MyPledgeListMetaDto extends MetaDto {
	@Expose()
	@ApiProperty({
		example: AMOUNT_EXAMPLE,
		description: "Sum of pledgedAmount across the caller's matching pledges",
	})
	sum!: number;
}
