import { ApiPropertyOptional } from "@nestjs/swagger";
import { DateRangeRequestDto } from "@shared/dto/date-range.request.dto";
import { Type } from "class-transformer";
import { IsInt, IsOptional, Max, Min } from "class-validator";

// Query for the admin Reports → Givers tab. `dateFrom`/`dateTo` bracket
// `Transaction.date`. When both bounds are absent the controller falls
// back to the last 12 months.
export class GiversReportQueryRequestDto extends DateRangeRequestDto {
	@ApiPropertyOptional({
		example: 50,
		minimum: 1,
		maximum: 200,
		description: "Max givers to return, sorted by total amount desc.",
	})
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	@Max(200)
	limit?: number;
}
