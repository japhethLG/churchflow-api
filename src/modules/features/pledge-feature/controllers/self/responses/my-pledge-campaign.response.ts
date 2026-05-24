import { PickType } from "@nestjs/swagger";
import { CampaignDto } from "@shared/dto/campaign.dto";

// Compact campaign snapshot embedded on each pledge so the member's
// pledges list can render the campaign title + resolved-deadline
// lifecycle without fanning out lookup requests.
export class MyPledgeCampaignDto extends PickType(CampaignDto, [
	"id",
	"title",
	"deadline",
	"deletedAt",
] as const) {}
