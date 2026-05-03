import { PartialType } from "@nestjs/swagger";

import { CreateCampaignItemRequestDto } from "./create-campaign-item.request";

export class UpdateCampaignItemRequestDto extends PartialType(
	CreateCampaignItemRequestDto,
) {}
