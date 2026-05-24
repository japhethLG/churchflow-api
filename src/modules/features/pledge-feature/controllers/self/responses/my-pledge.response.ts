import { ApiProperty, ApiPropertyOptional, OmitType } from "@nestjs/swagger";
import { PledgeDto } from "@shared/dto/pledge.dto";
import { DATE_UTC_EXAMPLE } from "@shared/dto-examples";
import { Expose, Type } from "class-transformer";

import { MyPledgeCampaignDto } from "./my-pledge-campaign.response";
import { MyPledgeCampaignItemDto } from "./my-pledge-campaign-item.response";

// Mirrors the admin tenant-intent PledgeLifecycle union so a member's
// page can use the same labels and color tokens.
export type MyPledgeLifecycle =
	| "fulfilled"
	| "on-track"
	| "due-soon"
	| "past-due"
	| "no-deadline"
	| "cancelled";

export class MyPledgeResponseDto extends OmitType(PledgeDto, [
	"deletedBy",
] as const) {
	@Expose()
	@Type(() => MyPledgeCampaignDto)
	@ApiProperty({ type: MyPledgeCampaignDto })
	campaign!: MyPledgeCampaignDto;

	@Expose()
	@Type(() => MyPledgeCampaignItemDto)
	@ApiPropertyOptional({ type: MyPledgeCampaignItemDto, nullable: true })
	campaignItem!: MyPledgeCampaignItemDto | null;

	@Expose()
	@ApiPropertyOptional({
		type: String,
		example: DATE_UTC_EXAMPLE,
		nullable: true,
		description:
			"Effective deadline. campaign-item deadline > campaign deadline > null.",
	})
	resolvedDeadline!: string | null;

	@Expose()
	@ApiPropertyOptional({
		type: Number,
		example: 7,
		nullable: true,
		description:
			"Days from today to `resolvedDeadline`. Null when no deadline.",
	})
	daysUntil!: number | null;

	@Expose()
	@ApiProperty({
		example: "on-track",
		enum: [
			"fulfilled",
			"on-track",
			"due-soon",
			"past-due",
			"no-deadline",
			"cancelled",
		],
	})
	lifecycle!: MyPledgeLifecycle;
}
