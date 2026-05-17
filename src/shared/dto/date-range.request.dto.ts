import { ApiPropertyOptional } from "@nestjs/swagger";
import { DATE_UTC_EXAMPLE } from "@shared/dto-examples";
import { Type } from "class-transformer";
import { IsDate, IsOptional } from "class-validator";

/**
 * Common date-range filter mixed into list endpoints that accept a
 * `dateFrom` / `dateTo` query pair. Both bounds are inclusive and
 * expected as ISO 8601 UTC. The column they apply to is endpoint-
 * specific (e.g. `pledgedAt` for pledges, `transactedAt` for
 * transactions) — only the contract is shared.
 *
 * Concrete filter DTOs should compose this with
 * `StateFilterRequestDto` / `PaginationRequestDto` via
 * `IntersectionType` from `@nestjs/swagger` so Swagger metadata is
 * preserved.
 */
export class DateRangeRequestDto {
	@ApiPropertyOptional({
		example: DATE_UTC_EXAMPLE,
		description: "Earliest timestamp to include (ISO 8601 UTC, inclusive).",
	})
	@IsOptional()
	@Type(() => Date)
	@IsDate()
	dateFrom?: Date;

	@ApiPropertyOptional({
		example: DATE_UTC_EXAMPLE,
		description: "Latest timestamp to include (ISO 8601 UTC, inclusive).",
	})
	@IsOptional()
	@Type(() => Date)
	@IsDate()
	dateTo?: Date;
}
