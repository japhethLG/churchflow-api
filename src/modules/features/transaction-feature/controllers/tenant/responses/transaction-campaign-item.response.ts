import { PickType } from "@nestjs/swagger";
import { CampaignItemDto } from "@shared/dto/campaign-item.dto";

// Compact campaign-item snapshot embedded on each transaction so the FE
// can render the earmark title inline without a lookup map.
export class TransactionCampaignItemDto extends PickType(CampaignItemDto, [
	"id",
	"title",
] as const) {}
