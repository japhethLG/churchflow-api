import { ApiProperty } from "@nestjs/swagger";
import { Expose } from "class-transformer";

export class MetaDto {
	@Expose()
	@ApiProperty({ example: 0, description: "Number of items skipped" })
	offset!: number;

	@Expose()
	@ApiProperty({ example: 50, description: "Page size" })
	limit!: number;

	@Expose()
	@ApiProperty({ example: 128, description: "Total items matching the query" })
	total!: number;
}
