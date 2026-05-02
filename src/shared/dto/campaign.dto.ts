import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { CampaignStatus } from "@prisma/client";
import { Expose } from "class-transformer";

import {
	CAMPAIGN_DESCRIPTION_EXAMPLE,
	CAMPAIGN_TITLE_EXAMPLE,
	DATE_UTC_EXAMPLE,
	FIREBASE_UID_EXAMPLE,
	ID_EXAMPLE,
} from "../dto-examples";

export class CampaignDto {
	@Expose()
	@ApiProperty({ example: ID_EXAMPLE })
	id!: string;

	@Expose()
	@ApiProperty({ example: ID_EXAMPLE })
	tenantId!: string;

	@Expose()
	@ApiProperty({ example: CAMPAIGN_TITLE_EXAMPLE })
	title!: string;

	@Expose()
	@ApiPropertyOptional({
		example: CAMPAIGN_DESCRIPTION_EXAMPLE,
		nullable: true,
	})
	description!: string | null;

	@Expose()
	@ApiPropertyOptional({
		example: DATE_UTC_EXAMPLE,
		nullable: true,
		description: "Null = open-ended campaign (no hard deadline)",
	})
	deadline!: Date | null;

	@Expose()
	@ApiProperty({ enum: CampaignStatus, example: CampaignStatus.ACTIVE })
	status!: CampaignStatus;

	@Expose()
	@ApiProperty({ example: FIREBASE_UID_EXAMPLE })
	createdBy!: string;

	@Expose()
	@ApiProperty({ example: DATE_UTC_EXAMPLE })
	createdAt!: Date;

	@Expose()
	@ApiProperty({ example: DATE_UTC_EXAMPLE })
	updatedAt!: Date;
}
