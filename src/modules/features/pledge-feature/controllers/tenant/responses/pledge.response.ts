import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { PledgeDto } from "@shared/dto/pledge.dto";
import { DATE_UTC_EXAMPLE } from "@shared/dto-examples";
import { Expose, Type } from "class-transformer";

import { PledgeCampaignDto } from "./pledge-campaign.response";
import { PledgeCampaignItemDto } from "./pledge-campaign-item.response";
import { PledgeMemberDto } from "./pledge-member.response";

// All lifecycle states a pledge can surface in. Mirrors the FE's
// PledgeLifecycle union — but computed server-side so every caller agrees.
export type PledgeLifecycle =
	| "fulfilled"
	| "on-track"
	| "due-soon"
	| "past-due"
	| "no-deadline"
	| "cancelled";

// Tenant-intent pledge response. Adds:
//   - embedded compact relations (member / campaign / campaign-item) so
//     list pages don't have to fan-out lookup queries.
//   - the resolved deadline (campaign-item deadline overrides campaign
//     deadline) so callers don't reimplement the precedence rule.
//   - the derived lifecycle bucket so dashboard + reports do not all
//     duplicate the same status/deadline math.
export class PledgeResponseDto extends PledgeDto {
	@Expose()
	@Type(() => PledgeMemberDto)
	@ApiProperty({
		type: PledgeMemberDto,
		description:
			"Compact member snapshot. Required relation in the schema; the FE should check `member.deletedAt` to render a tombstone label.",
	})
	member!: PledgeMemberDto;

	@Expose()
	@Type(() => PledgeCampaignDto)
	@ApiProperty({
		type: PledgeCampaignDto,
		description:
			"Compact campaign snapshot, including its deadline. Required relation; FE should check `campaign.deletedAt`.",
	})
	campaign!: PledgeCampaignDto;

	@Expose()
	@Type(() => PledgeCampaignItemDto)
	@ApiPropertyOptional({
		type: PledgeCampaignItemDto,
		nullable: true,
		description:
			"Compact campaign-item snapshot when the pledge is scoped to a line item. Null when the pledge applies to the overall campaign.",
	})
	campaignItem!: PledgeCampaignItemDto | null;

	@Expose()
	@ApiPropertyOptional({
		type: String,
		example: DATE_UTC_EXAMPLE,
		nullable: true,
		description:
			"Effective deadline for the pledge. campaign-item deadline > campaign deadline > null (open-ended).",
	})
	resolvedDeadline!: string | null;

	@Expose()
	@ApiPropertyOptional({
		type: Number,
		example: 7,
		nullable: true,
		description:
			"Days from today until `resolvedDeadline`, computed at query time. Negative when past due; null when there is no deadline.",
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
		description:
			"Derived lifecycle bucket: cancelled > fulfilled (status or paid≥pledged) > deadline-based (no-deadline / past-due / due-soon ≤14d / on-track).",
	})
	lifecycle!: PledgeLifecycle;
}
