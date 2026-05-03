import { ApiProperty } from "@nestjs/swagger";
import { CampaignDto } from "@shared/dto/campaign.dto";
import { Expose, Type } from "class-transformer";

import { CampaignItemResponseDto } from "./campaign-item.response";

export class CampaignWithItemsResponseDto extends CampaignDto {
	@Expose()
	@Type(() => CampaignItemResponseDto)
	@ApiProperty({ type: [CampaignItemResponseDto] })
	items!: CampaignItemResponseDto[];
}
