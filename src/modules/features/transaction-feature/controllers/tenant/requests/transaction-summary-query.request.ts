import { ApiPropertyOptional, IntersectionType } from "@nestjs/swagger";
import { TransactionType } from "@prisma/client";
import { DateRangeRequestDto } from "@shared/dto/date-range.request.dto";
import { StateFilterRequestDto } from "@shared/dto/state-filter.request.dto";
import { ID_EXAMPLE } from "@shared/dto-examples";
import { Transform, Type } from "class-transformer";
import {
	IsBoolean,
	IsEnum,
	IsInt,
	IsOptional,
	IsString,
	Max,
	Min,
} from "class-validator";

// Query DTO for the admin transaction summary endpoint. `dateFrom` /
// `dateTo` bracket `Transaction.date`. When both bounds are absent the
// feature service falls back to a rolling `months` window ending today.
//
// The card respects the same filter set as the list endpoint
// (`type`, `campaignId`, `memberId`, `includeDeleted`/`onlyDeleted`) so
// the KPI numbers cannot diverge from the rows the admin sees below.
export class TransactionSummaryQueryRequestDto extends IntersectionType(
	DateRangeRequestDto,
	StateFilterRequestDto,
) {
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

	@ApiPropertyOptional({
		example: ID_EXAMPLE,
		description: "Narrow the summary to a single campaign.",
	})
	@IsOptional()
	@IsString()
	campaignId?: string;

	@ApiPropertyOptional({
		enum: TransactionType,
		description: "Narrow the summary to a single transaction type.",
	})
	@IsOptional()
	@IsEnum(TransactionType)
	type?: TransactionType;

	@ApiPropertyOptional({
		type: Boolean,
		example: true,
		description:
			'Set to true for a true-lifetime summary — defeats the 12-month "no-bounds" fallback when both dateFrom and dateTo are omitted. Ignored when explicit bounds are provided.',
	})
	@IsOptional()
	@Transform(({ value }) => {
		if (value === true || value === "true" || value === 1 || value === "1") {
			return true;
		}
		if (value === false || value === "false" || value === 0 || value === "0") {
			return false;
		}
		return value;
	})
	@IsBoolean()
	lifetime?: boolean;
}
