import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsBoolean, IsOptional } from "class-validator";

/**
 * Common 3-state archive filter mixed into every list-endpoint request
 * DTO. Encoding matches `applyStateFilter` in
 * `@infrastructure/prisma-client/soft-delete`.
 *
 * Concrete filter DTOs should `extends StateFilterRequestDto` rather
 * than redeclaring the two boolean fields — that ensures every list
 * endpoint exposes the same query-string contract and accepts the same
 * coercion rules.
 */
export class StateFilterRequestDto {
	@ApiPropertyOptional({
		example: false,
		description:
			'Include soft-deleted rows alongside active ones — "All" view.',
	})
	@IsOptional()
	@Type(() => Boolean)
	@IsBoolean()
	includeDeleted?: boolean;

	@ApiPropertyOptional({
		example: false,
		description:
			'Return ONLY soft-deleted rows — "Deleted" view. Takes precedence over includeDeleted.',
	})
	@IsOptional()
	@Type(() => Boolean)
	@IsBoolean()
	onlyDeleted?: boolean;
}
