import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
	AMOUNT_EXAMPLE,
	CAMPAIGN_DESCRIPTION_EXAMPLE,
	CAMPAIGN_ITEM_TITLE_EXAMPLE,
	DATE_UTC_EXAMPLE,
	INT_EXAMPLE,
} from "@shared/dto-examples";
import { Type } from "class-transformer";
import {
	IsDate,
	IsInt,
	IsNumber,
	IsOptional,
	IsString,
	Min,
} from "class-validator";

export class CreateCampaignItemRequestDto {
	@ApiProperty({ example: CAMPAIGN_ITEM_TITLE_EXAMPLE })
	@IsString()
	title!: string;

	@ApiPropertyOptional({ example: CAMPAIGN_DESCRIPTION_EXAMPLE })
	@IsOptional()
	@IsString()
	description?: string;

	@ApiProperty({ example: AMOUNT_EXAMPLE })
	@IsNumber({ maxDecimalPlaces: 2 })
	@Min(0)
	targetAmount!: number;

	@ApiPropertyOptional({
		example: DATE_UTC_EXAMPLE,
		description: "Defaults to the campaign deadline when omitted",
	})
	@IsOptional()
	@Type(() => Date)
	@IsDate()
	deadline?: Date;

	@ApiPropertyOptional({ example: INT_EXAMPLE })
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(0)
	sortOrder?: number;
}
