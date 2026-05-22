import { ApiPropertyOptional } from "@nestjs/swagger";
import { DateRangeRequestDto } from "@shared/dto/date-range.request.dto";
import { Type } from "class-transformer";
import { IsInt, IsOptional, Max, Min } from "class-validator";

// Query DTO for the self-intent transaction summary endpoint. Mirrors
// the admin variant — explicit dateFrom/dateTo wins; otherwise `months`
// (default 12, max 60) produces a rolling window ending today. The
// caller's memberId is forced server-side from the tenant context.
export class MyTransactionSummaryQueryRequestDto extends DateRangeRequestDto {
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
}
