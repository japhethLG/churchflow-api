import { ApiProperty, OmitType } from "@nestjs/swagger";
import { CampaignDto } from "@shared/dto/campaign.dto";
import { Expose, Type } from "class-transformer";

import { MyCampaignItemResponseDto } from "./my-campaign-item.response";

export class MyCampaignWithItemsResponseDto extends OmitType(CampaignDto, [
	"deletedBy",
] as const) {
	@Expose()
	@Type(() => MyCampaignItemResponseDto)
	@ApiProperty({ type: [MyCampaignItemResponseDto] })
	items!: MyCampaignItemResponseDto[];
}
