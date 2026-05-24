import { ApiPropertyOptional, IntersectionType } from "@nestjs/swagger";
import { MemberStatus } from "@prisma/client";
import { DateRangeRequestDto } from "@shared/dto/date-range.request.dto";
import { PaginationRequestDto } from "@shared/dto/pagination.request.dto";
import { StateFilterRequestDto } from "@shared/dto/state-filter.request.dto";
import { IsEnum, IsOptional, IsString } from "class-validator";

// `dateFrom`/`dateTo` (inherited from DateRangeRequestDto) bracket
// `Member.createdAt` — used to count members joining in a window
// without paginating the entire roster.
export class MemberFiltersRequestDto extends IntersectionType(
	StateFilterRequestDto,
	DateRangeRequestDto,
	PaginationRequestDto,
) {
	@ApiPropertyOptional({ enum: MemberStatus })
	@IsOptional()
	@IsEnum(MemberStatus)
	status?: MemberStatus;

	@ApiPropertyOptional()
	@IsOptional()
	@IsString()
	search?: string;
}
