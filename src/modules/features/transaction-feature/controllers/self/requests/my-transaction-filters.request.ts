import { ApiPropertyOptional, IntersectionType } from "@nestjs/swagger";
import { TransactionType } from "@prisma/client";
import { DateRangeRequestDto } from "@shared/dto/date-range.request.dto";
import { PaginationRequestDto } from "@shared/dto/pagination.request.dto";
import { ID_EXAMPLE } from "@shared/dto-examples";
import { IsEnum, IsOptional, IsString } from "class-validator";

// Self-service filters. memberId is forced to the authenticated tenant
// context — members may still narrow by campaign, type, or date range.
// `dateFrom`/`dateTo` bracket `Transaction.date`.
export class MyTransactionFiltersRequestDto extends IntersectionType(
	DateRangeRequestDto,
	PaginationRequestDto,
) {
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
