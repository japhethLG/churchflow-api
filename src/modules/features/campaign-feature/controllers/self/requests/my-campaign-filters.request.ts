import { ApiPropertyOptional, IntersectionType } from "@nestjs/swagger";
import { CampaignStatus } from "@prisma/client";
import { DateRangeRequestDto } from "@shared/dto/date-range.request.dto";
import { PaginationRequestDto } from "@shared/dto/pagination.request.dto";
import { StateFilterRequestDto } from "@shared/dto/state-filter.request.dto";
import { IsEnum, IsOptional } from "class-validator";

// Members do not get an admin-style 3-state archive switcher. Self-side
// callers (member dashboards, MemberTransactions) opt into
// `includeDeleted=true` purely so they can render Mode-B DeletedLabel
// fallbacks for rows that reference archived campaigns. No UI filter.
// `dateFrom`/`dateTo` bracket `createdAt`.
export class MyCampaignFiltersRequestDto extends IntersectionType(
	StateFilterRequestDto,
	DateRangeRequestDto,
	PaginationRequestDto,
) {
	@ApiPropertyOptional({ enum: CampaignStatus })
	@IsOptional()
	@IsEnum(CampaignStatus)
	status?: CampaignStatus;
}
