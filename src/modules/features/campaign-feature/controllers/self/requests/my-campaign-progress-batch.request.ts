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

// Self-intent mirror of CampaignProgressBatchRequestDto. `ids` arrives as
// a comma-separated string; split + deduped in @Transform so the member
// dashboard / campaigns list can fetch many progress bars in one call
// instead of fanning out N /me/campaigns/:id/progress requests.
export class MyCampaignProgressBatchRequestDto {
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
