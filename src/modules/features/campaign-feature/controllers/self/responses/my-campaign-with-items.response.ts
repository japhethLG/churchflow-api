import { ApiProperty } from "@nestjs/swagger";
import { CampaignDto } from "@shared/dto/campaign.dto";
import { Expose, Type } from "class-transformer";

import { MyCampaignItemResponseDto } from "./my-campaign-item.response";

export class MyCampaignWithItemsResponseDto extends CampaignDto {
	@Expose()
	@Type(() => MyCampaignItemResponseDto)
	@ApiProperty({ type: [MyCampaignItemResponseDto] })
	items!: MyCampaignItemResponseDto[];
}
