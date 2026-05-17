import { OmitType } from "@nestjs/swagger";
import { CampaignDto } from "@shared/dto/campaign.dto";

// Members must NOT see who deleted a campaign — internal User.id is leakage.
// `deletedAt` stays so the member-side detail page can render the read-only
// banner when a referenced campaign is archived.
export class MyCampaignResponseDto extends OmitType(CampaignDto, [
	"deletedBy",
] as const) {}
