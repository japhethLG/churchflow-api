import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { TransactionType } from "@prisma/client";
import {
	AMOUNT_EXAMPLE,
	DATE_UTC_EXAMPLE,
	ID_EXAMPLE,
	REFERENCE_NUMBER_EXAMPLE,
	STRING_EXAMPLE,
} from "@shared/dto-examples";
import { Type } from "class-transformer";
import {
	IsDate,
	IsEnum,
	IsNumber,
	IsOptional,
	IsString,
	Min,
} from "class-validator";

export class CreateTransactionRequestDto {
	@ApiProperty({ enum: TransactionType, example: TransactionType.TITHE })
	@IsEnum(TransactionType)
	type!: TransactionType;

	@ApiProperty({ example: AMOUNT_EXAMPLE })
	@IsNumber({ maxDecimalPlaces: 2 })
	@Min(0)
	amount!: number;

	@ApiProperty({ example: DATE_UTC_EXAMPLE })
	@Type(() => Date)
	@IsDate()
	date!: Date;

	@ApiPropertyOptional({ example: ID_EXAMPLE })
	@IsOptional()
	@IsString()
	memberId?: string;

	@ApiPropertyOptional({
		example: ID_EXAMPLE,
		description: "Campaign this gift is attributed to",
	})
	@IsOptional()
	@IsString()
	campaignId?: string;

	@ApiPropertyOptional({
		example: ID_EXAMPLE,
		description:
			"Campaign item earmark. Must belong to campaignId when both are set.",
	})
	@IsOptional()
	@IsString()
	campaignItemId?: string;

	@ApiPropertyOptional({
		example: ID_EXAMPLE,
		description:
			"Pledge this payment fulfills. When set, campaignId and campaignItemId must match the pledge.",
	})
	@IsOptional()
	@IsString()
	pledgeId?: string;

	@ApiPropertyOptional({ example: STRING_EXAMPLE })
	@IsOptional()
	@IsString()
	customType?: string;

	@ApiPropertyOptional({ example: STRING_EXAMPLE })
	@IsOptional()
	@IsString()
	note?: string;

	@ApiPropertyOptional({ example: REFERENCE_NUMBER_EXAMPLE })
	@IsOptional()
	@IsString()
	referenceNumber?: string;
}
