import { ApiProperty } from "@nestjs/swagger";
import { ID_EXAMPLE } from "@shared/dto-examples";
import { ArrayMaxSize, ArrayUnique, IsArray, IsString } from "class-validator";

// Body for POST /campaigns/progress/batch. Caps the request at 100 ids
// to keep the per-call cost bounded — the dashboard never asks for more
// than a handful at a time. Larger batches should paginate at the FE.
export class CampaignProgressBatchRequestDto {
	@ApiProperty({
		type: [String],
		example: [ID_EXAMPLE],
		description: "Campaign IDs to fetch progress for. Max 100.",
	})
	@IsArray()
	@ArrayUnique()
	@ArrayMaxSize(100)
	@IsString({ each: true })
	campaignIds!: string[];
}
