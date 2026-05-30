import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
	ArrayMaxSize,
	ArrayNotEmpty,
	IsArray,
	IsInt,
	IsOptional,
	IsString,
	Max,
	Min,
} from "class-validator";

// Query for the members-list sparkline rollup. `memberIds` is the set of
// members currently on the page (comma-separated or repeated) — bounding
// the aggregation to what's visible. `months` is the rolling window.
export class MemberGivingTrendRequestDto {
	@ApiProperty({
		type: [String],
		description:
			"Member ids to compute the trend for (the page's visible rows). Comma-separated or repeated query param.",
	})
	@Transform(({ value }) => {
		if (Array.isArray(value)) {
			return value;
		}
		if (typeof value === "string") {
			return value
				.split(",")
				.map((v) => v.trim())
				.filter(Boolean);
		}
		return [];
	})
	@IsArray()
	@ArrayNotEmpty()
	@ArrayMaxSize(200)
	@IsString({ each: true })
	memberIds!: string[];

	@ApiPropertyOptional({
		example: 12,
		minimum: 1,
		maximum: 24,
		description: "Rolling window length in months (default 12).",
	})
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	@Max(24)
	months?: number;
}
