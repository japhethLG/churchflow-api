import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Prisma } from "@prisma/client";
import { Expose, Transform } from "class-transformer";

import {
	AMOUNT_EXAMPLE,
	CAMPAIGN_ITEM_TITLE_EXAMPLE,
	DATE_UTC_EXAMPLE,
	ID_EXAMPLE,
	INT_EXAMPLE,
	STRING_EXAMPLE,
} from "../dto-examples";

export class CampaignItemDto {
	@Expose()
	@ApiProperty({ example: ID_EXAMPLE })
	id!: string;

	@Expose()
	@ApiProperty({ example: ID_EXAMPLE })
	tenantId!: string;

	@Expose()
	@ApiProperty({ example: ID_EXAMPLE })
	campaignId!: string;

	@Expose()
	@ApiProperty({ example: CAMPAIGN_ITEM_TITLE_EXAMPLE })
	title!: string;

	@Expose()
	@ApiPropertyOptional({ example: STRING_EXAMPLE, nullable: true })
	description!: string | null;

	@Expose()
	@Transform(({ value }) =>
		value instanceof Prisma.Decimal ? value.toNumber() : value,
	)
	@ApiProperty({
		example: AMOUNT_EXAMPLE,
		description: "Target raise amount for this item",
	})
	targetAmount!: number;

	@Expose()
	@ApiPropertyOptional({
		example: DATE_UTC_EXAMPLE,
		nullable: true,
		description: "Null = inherit campaign deadline",
	})
	deadline!: Date | null;

	@Expose()
	@ApiProperty({ example: INT_EXAMPLE })
	sortOrder!: number;

	@Expose()
	@ApiProperty({ example: DATE_UTC_EXAMPLE })
	createdAt!: Date;

	@Expose()
	@ApiProperty({ example: DATE_UTC_EXAMPLE })
	updatedAt!: Date;

	@Expose()
	@ApiPropertyOptional({ example: DATE_UTC_EXAMPLE, nullable: true })
	deletedAt!: Date | null;
}
