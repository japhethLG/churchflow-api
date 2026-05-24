import { ApiPropertyOptional } from "@nestjs/swagger";
import { TransactionDto } from "@shared/dto/transaction.dto";
import { Expose, Type } from "class-transformer";

import { TransactionCampaignDto } from "./transaction-campaign.response";
import { TransactionCampaignItemDto } from "./transaction-campaign-item.response";
import { TransactionMemberDto } from "./transaction-member.response";

// Tenant-intent transaction response. Adds embedded compact snapshots of
// the related member / campaign / campaign-item so list pages don't have
// to prefetch full member/campaign tables just to render row labels.
// Each embed surfaces its own `deletedAt` so the FE can render a tombstone
// label when the referenced row was archived after the gift was recorded.
export class TransactionResponseDto extends TransactionDto {
	@Expose()
	@Type(() => TransactionMemberDto)
	@ApiPropertyOptional({
		type: TransactionMemberDto,
		nullable: true,
		description:
			"Compact member snapshot when memberId is set. Null when the gift was recorded anonymously.",
	})
	member!: TransactionMemberDto | null;

	@Expose()
	@Type(() => TransactionCampaignDto)
	@ApiPropertyOptional({
		type: TransactionCampaignDto,
		nullable: true,
		description:
			"Compact campaign snapshot when campaignId is set. Null when no campaign was attributed.",
	})
	campaign!: TransactionCampaignDto | null;

	@Expose()
	@Type(() => TransactionCampaignItemDto)
	@ApiPropertyOptional({
		type: TransactionCampaignItemDto,
		nullable: true,
		description:
			"Compact campaign-item snapshot when the gift is earmarked to a line item.",
	})
	campaignItem!: TransactionCampaignItemDto | null;
}
