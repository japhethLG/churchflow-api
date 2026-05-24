import { PickType } from "@nestjs/swagger";
import { CampaignItemDto } from "@shared/dto/campaign-item.dto";

export class MyPledgeCampaignItemDto extends PickType(CampaignItemDto, [
	"id",
	"title",
	"deadline",
] as const) {}
