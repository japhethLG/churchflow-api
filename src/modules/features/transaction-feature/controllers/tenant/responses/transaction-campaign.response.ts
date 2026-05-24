import { PickType } from "@nestjs/swagger";
import { CampaignDto } from "@shared/dto/campaign.dto";

// Compact campaign snapshot embedded on each transaction so the FE can
// render the campaign title (+ archived-tombstone badge) inline.
export class TransactionCampaignDto extends PickType(CampaignDto, [
	"id",
	"title",
	"deletedAt",
] as const) {}
