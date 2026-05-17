import { OmitType } from "@nestjs/swagger";
import { CampaignItemDto } from "@shared/dto/campaign-item.dto";

export class MyCampaignItemResponseDto extends OmitType(CampaignItemDto, [
	"deletedBy",
] as const) {}
