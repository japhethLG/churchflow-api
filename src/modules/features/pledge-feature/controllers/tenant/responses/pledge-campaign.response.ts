import { PickType } from "@nestjs/swagger";
import { CampaignDto } from "@shared/dto/campaign.dto";

// Compact campaign snapshot embedded on each pledge. `deadline` is here
// because pledge lifecycle depends on it; the FE used to fan-out
// /campaigns/{id} requests to fetch it (see useCampaignsManyWithItems).
export class PledgeCampaignDto extends PickType(CampaignDto, [
	"id",
	"title",
	"deadline",
	"deletedAt",
] as const) {}
