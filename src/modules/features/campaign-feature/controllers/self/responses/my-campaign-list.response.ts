import { ApiProperty } from "@nestjs/swagger";
import { MetaDto } from "@shared/dto/meta.dto";
import { Expose, Type } from "class-transformer";

import { MyCampaignResponseDto } from "./my-campaign.response";

export class MyCampaignListResponseDto {
	@Expose()
	@Type(() => MyCampaignResponseDto)
	@ApiProperty({ type: [MyCampaignResponseDto] })
	items!: MyCampaignResponseDto[];

	@Expose()
	@Type(() => MetaDto)
	@ApiProperty({ type: MetaDto })
	meta!: MetaDto;
}
