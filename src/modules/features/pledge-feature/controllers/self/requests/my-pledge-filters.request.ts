import { ApiPropertyOptional, IntersectionType } from "@nestjs/swagger";
import { PledgeStatus } from "@prisma/client";
import { DateRangeRequestDto } from "@shared/dto/date-range.request.dto";
import { PaginationRequestDto } from "@shared/dto/pagination.request.dto";
import { StateFilterRequestDto } from "@shared/dto/state-filter.request.dto";
import { ID_EXAMPLE } from "@shared/dto-examples";
import { IsEnum, IsOptional, IsString } from "class-validator";

// Self-service filters. memberId is NOT accepted — the controller pins it
// to the authenticated tenant context. Members may still narrow by
// campaign / campaign item / status / date range. The two archive flags
// are inherited so self-side callers can opt into tombstones for Mode-B
// label fallbacks (no admin-style 3-state UI is exposed to members).
// `dateFrom`/`dateTo` bracket `createdAt` — Pledge has no separate
// `pledgedAt` column.
export class MyPledgeFiltersRequestDto extends IntersectionType(
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

	@ApiPropertyOptional({ enum: PledgeStatus })
	@IsOptional()
	@IsEnum(PledgeStatus)
	status?: PledgeStatus;
}
