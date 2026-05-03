import { PartialType } from "@nestjs/swagger";

import { CreateCampaignRequestDto } from "./create-campaign.request";

export class UpdateCampaignRequestDto extends PartialType(
	CreateCampaignRequestDto,
) {}
