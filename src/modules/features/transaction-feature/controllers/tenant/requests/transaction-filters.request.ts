import { ApiPropertyOptional } from "@nestjs/swagger";
import { TransactionType } from "@prisma/client";
import { DATE_UTC_EXAMPLE, ID_EXAMPLE } from "@shared/dto-examples";
import { Type } from "class-transformer";
import {
	IsDate,
	IsEnum,
	IsInt,
	IsOptional,
	IsString,
	Min,
} from "class-validator";

export class TransactionFiltersRequestDto {
	@ApiPropertyOptional({ example: ID_EXAMPLE })
	@IsOptional()
	@IsString()
	memberId?: string;

	@ApiPropertyOptional({ example: ID_EXAMPLE })
	@IsOptional()
	@IsString()
	campaignId?: string;

	@ApiPropertyOptional({ example: ID_EXAMPLE })
	@IsOptional()
	@IsString()
	campaignItemId?: string;

	@ApiPropertyOptional({ example: ID_EXAMPLE })
	@IsOptional()
	@IsString()
	pledgeId?: string;

	@ApiPropertyOptional({ enum: TransactionType })
	@IsOptional()
	@IsEnum(TransactionType)
	type?: TransactionType;

	@ApiPropertyOptional({ example: DATE_UTC_EXAMPLE })
	@IsOptional()
	@Type(() => Date)
	@IsDate()
	dateFrom?: Date;

	@ApiPropertyOptional({ example: DATE_UTC_EXAMPLE })
	@IsOptional()
	@Type(() => Date)
	@IsDate()
	dateTo?: Date;

	@ApiPropertyOptional({ example: 0 })
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(0)
	offset?: number;

	@ApiPropertyOptional({ example: 50 })
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	limit?: number;
}
