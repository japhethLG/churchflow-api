import { ApiPropertyOptional, IntersectionType } from "@nestjs/swagger";
import { PledgeStatus } from "@prisma/client";
import { DateRangeRequestDto } from "@shared/dto/date-range.request.dto";
import { PaginationRequestDto } from "@shared/dto/pagination.request.dto";
import { StateFilterRequestDto } from "@shared/dto/state-filter.request.dto";
import { ID_EXAMPLE } from "@shared/dto-examples";
import { IsEnum, IsOptional, IsString } from "class-validator";

// Tenant-wide filters. Admin can scope by any memberId; super-admin too.
// Self-service uses my-pledge-filters.request.ts which omits memberId.
// `dateFrom`/`dateTo` (inherited from DateRangeRequestDto) bracket
// `createdAt` — Pledge has no separate `pledgedAt` column.
export class PledgeFiltersRequestDto extends IntersectionType(
	StateFilterRequestDto,
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
	memberId?: string;

	@ApiPropertyOptional({ enum: PledgeStatus })
	@IsOptional()
	@IsEnum(PledgeStatus)
	status?: PledgeStatus;
}
