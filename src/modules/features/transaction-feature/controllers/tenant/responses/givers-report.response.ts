import { ApiProperty } from "@nestjs/swagger";
import { Expose, Type } from "class-transformer";

import { GiverRowDto } from "./giver-row.response";

export class GiversReportResponseDto {
	@Expose()
	@Type(() => GiverRowDto)
	@ApiProperty({
		type: [GiverRowDto],
		description: "Top-N givers sorted by total amount descending.",
	})
	items!: GiverRowDto[];

	@Expose()
	@ApiProperty({
		type: [String],
		example: ["2026-01", "2026-02", "2026-03"],
		description:
			"Month labels (YYYY-MM UTC) that all giver rows' `monthlyTotals` align to.",
	})
	months!: string[];
}
