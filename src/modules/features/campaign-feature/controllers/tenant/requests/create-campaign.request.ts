import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { CampaignStatus } from "@prisma/client";
import {
	CAMPAIGN_DESCRIPTION_EXAMPLE,
	CAMPAIGN_TITLE_EXAMPLE,
	DATE_UTC_EXAMPLE,
} from "@shared/dto-examples";
import { Type } from "class-transformer";
import { IsDate, IsEnum, IsOptional, IsString } from "class-validator";

export class CreateCampaignRequestDto {
	@ApiProperty({ example: CAMPAIGN_TITLE_EXAMPLE })
	@IsString()
	title!: string;

	@ApiPropertyOptional({ example: CAMPAIGN_DESCRIPTION_EXAMPLE })
	@IsOptional()
	@IsString()
	description?: string;

	@ApiPropertyOptional({
		example: DATE_UTC_EXAMPLE,
		description: "Omit for open-ended campaigns",
	})
	@IsOptional()
	@Type(() => Date)
	@IsDate()
	deadline?: Date;

	@ApiPropertyOptional({ enum: CampaignStatus })
	@IsOptional()
	@IsEnum(CampaignStatus)
	status?: CampaignStatus;
}
