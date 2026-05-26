import { ApiProperty } from "@nestjs/swagger";
import { ID_EXAMPLE } from "@shared/dto-examples";
import { Transform } from "class-transformer";
import {
	ArrayMaxSize,
	ArrayMinSize,
	ArrayUnique,
	IsArray,
	IsString,
} from "class-validator";

// Query DTO for GET /campaigns/progress/batch. `ids` arrives as a comma-
// separated string; we split + dedupe in the @Transform so the validator
// sees an array. Capped at 100 ids to keep per-call cost bounded — the
// dashboard never asks for more than a handful at a time.
export class CampaignProgressBatchRequestDto {
	@ApiProperty({
		type: String,
		example: ID_EXAMPLE,
		description:
			"Comma-separated list of campaign IDs to fetch progress for. Max 100.",
	})
	@Transform(({ value }) => {
		if (Array.isArray(value)) {
			return value;
		}
		if (typeof value !== "string") {
			return value;
		}
		return value
			.split(",")
			.map((s) => s.trim())
			.filter(Boolean);
	})
	@IsArray()
	@ArrayMinSize(1)
	@ArrayUnique()
	@ArrayMaxSize(100)
	@IsString({ each: true })
	ids!: string[];
}
