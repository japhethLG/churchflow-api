import { ApiPropertyOptional, IntersectionType } from "@nestjs/swagger";
import { TransactionType } from "@prisma/client";
import { DateRangeRequestDto } from "@shared/dto/date-range.request.dto";
import { PaginationRequestDto } from "@shared/dto/pagination.request.dto";
import { StateFilterRequestDto } from "@shared/dto/state-filter.request.dto";
import { ID_EXAMPLE } from "@shared/dto-examples";
import { IsEnum, IsOptional, IsString } from "class-validator";

// `dateFrom`/`dateTo` (inherited from DateRangeRequestDto) bracket
// `Transaction.date`.
export class TransactionFiltersRequestDto extends IntersectionType(
	StateFilterRequestDto,
	DateRangeRequestDto,
	PaginationRequestDto,
) {
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
}
