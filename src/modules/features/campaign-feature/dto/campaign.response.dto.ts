import { ApiProperty } from "@nestjs/swagger";
import { CampaignDto } from "@shared/dto/campaign.dto";
import { CampaignItemDto } from "@shared/dto/campaign-item.dto";
import { MetaDto } from "@shared/dto/meta.dto";
import { AMOUNT_EXAMPLE, ID_EXAMPLE, INT_EXAMPLE } from "@shared/dto-examples";
import { Expose, Type } from "class-transformer";

export class CampaignResponseDto extends CampaignDto {}

export class CampaignItemResponseDto extends CampaignItemDto {}

// A campaign with its items embedded — the normal read shape for detail
// views. The list endpoint returns bare CampaignResponseDto for speed.
export class CampaignWithItemsResponseDto extends CampaignDto {
	@Expose()
	@Type(() => CampaignItemResponseDto)
	@ApiProperty({ type: [CampaignItemResponseDto] })
	items!: CampaignItemResponseDto[];
}

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

export class CampaignItemProgressDto {
	@Expose()
	@ApiProperty({ example: ID_EXAMPLE })
	itemId!: string;

	@Expose()
	@ApiProperty({ example: "Roofing" })
	title!: string;

	@Expose()
	@ApiProperty({ example: AMOUNT_EXAMPLE })
	targetAmount!: number;

	@Expose()
	@ApiProperty({
		example: AMOUNT_EXAMPLE,
		description: "Sum of pledges against this item",
	})
	pledgedAmount!: number;

	@Expose()
	@ApiProperty({
		example: AMOUNT_EXAMPLE,
		description: "Sum of transactions attributed to this item",
	})
	raisedAmount!: number;

	@Expose()
	@ApiProperty({ example: INT_EXAMPLE })
	pledgeCount!: number;
}

export class CampaignProgressResponseDto {
	@Expose()
	@ApiProperty({ example: ID_EXAMPLE })
	campaignId!: string;

	@Expose()
	@ApiProperty({
		example: AMOUNT_EXAMPLE,
		description: "Goal = sum of items.targetAmount",
	})
	goalAmount!: number;

	@Expose()
	@ApiProperty({
		example: AMOUNT_EXAMPLE,
		description: "Sum of pledges (items + unscoped campaign pledges)",
	})
	pledgedAmount!: number;

	@Expose()
	@ApiProperty({
		example: AMOUNT_EXAMPLE,
		description: "Sum of transactions attributed to this campaign",
	})
	raisedAmount!: number;

	@Expose()
	@ApiProperty({ example: INT_EXAMPLE, description: "Total active pledges" })
	pledgeCount!: number;

	@Expose()
	@Type(() => CampaignItemProgressDto)
	@ApiProperty({ type: [CampaignItemProgressDto] })
	items!: CampaignItemProgressDto[];
}
