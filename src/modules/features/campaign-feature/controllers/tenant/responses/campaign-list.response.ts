import { ApiProperty } from "@nestjs/swagger";
import { MetaDto } from "@shared/dto/meta.dto";
import { Expose, Type } from "class-transformer";

import { CampaignResponseDto } from "./campaign.response";

export class CampaignListResponseDto {
	@Expose()
	@Type(() => CampaignResponseDto)
	@ApiProperty({ type: [CampaignResponseDto] })
	items!: CampaignResponseDto[];

	@Expose()
	@Type(() => MetaDto)
	@ApiProperty({ type: MetaDto })
	meta!: MetaDto;
}
