import { ApiPropertyOptional } from "@nestjs/swagger";
import { DateRangeRequestDto } from "@shared/dto/date-range.request.dto";
import { ID_EXAMPLE } from "@shared/dto-examples";
import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, Max, Min } from "class-validator";

// Query DTO for the admin transaction summary endpoint. If `dateFrom`
// / `dateTo` are supplied (either or both), the feature service uses
// them verbatim — month-trend buckets are derived from the inclusive
// range. `months` is the legacy fallback: when neither bound is
// present, the feature service produces a rolling window of N months
// ending today. Both inputs together are accepted but the explicit
// range wins.
export class TransactionSummaryQueryRequestDto extends DateRangeRequestDto {
	@ApiPropertyOptional({
		example: 12,
		minimum: 1,
		maximum: 60,
		description:
			"Rolling window size in months — used only when neither dateFrom nor dateTo is set.",
	})
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	@Max(60)
	months?: number;

	@ApiPropertyOptional({
		example: ID_EXAMPLE,
		description:
			"Narrow the summary to a single member. Used by admin member-detail pages to render the same donut + table the dashboard uses, but scoped to one member.",
	})
	@IsOptional()
	@IsString()
	memberId?: string;
}
