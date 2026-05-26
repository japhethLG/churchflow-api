import { PickType } from "@nestjs/swagger";
import { CampaignItemDto } from "@shared/dto/campaign-item.dto";

// Compact campaign-item snapshot embedded on each pledge that is
// earmarked to a single line item. `deadline` is included so the pledge
// lifecycle resolver does not have to issue a separate item fetch.
export class PledgeCampaignItemDto extends PickType(CampaignItemDto, [
	"id",
	"title",
	"deadline",
	"deletedAt",
] as const) {}
