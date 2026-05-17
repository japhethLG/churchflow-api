import { ApiPropertyOptional, IntersectionType } from "@nestjs/swagger";
import { CampaignStatus } from "@prisma/client";
import { DateRangeRequestDto } from "@shared/dto/date-range.request.dto";
import { PaginationRequestDto } from "@shared/dto/pagination.request.dto";
import { StateFilterRequestDto } from "@shared/dto/state-filter.request.dto";
import { IsEnum, IsOptional } from "class-validator";

// `dateFrom`/`dateTo` (inherited from DateRangeRequestDto) bracket
// `createdAt` — Campaign has no launch-date column.
export class CampaignFiltersRequestDto extends IntersectionType(
	StateFilterRequestDto,
	DateRangeRequestDto,
	PaginationRequestDto,
) {
	@ApiPropertyOptional({ enum: CampaignStatus })
	@IsOptional()
	@IsEnum(CampaignStatus)
	status?: CampaignStatus;
}
