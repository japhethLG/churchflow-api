import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsOptional, Min } from "class-validator";

/**
 * Common offset/limit pagination contract mixed into every list-
 * endpoint request DTO. Per-endpoint upper bounds on `limit` (e.g.
 * audit-log capping at 200) are enforced by overriding `limit` in the
 * concrete DTO — class-validator merges the additional `@Max()`
 * decorator with the inherited rules.
 *
 * Concrete filter DTOs should compose this with
 * `StateFilterRequestDto` / `DateRangeRequestDto` via
 * `IntersectionType` from `@nestjs/swagger` so Swagger metadata is
 * preserved.
 */
export class PaginationRequestDto {
	@ApiPropertyOptional({ example: 0 })
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(0)
	offset?: number;

	@ApiPropertyOptional({ example: 50 })
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	limit?: number;
}
