import { ApiPropertyOptional } from "@nestjs/swagger";
import { PledgeStatus } from "@prisma/client";
import { ID_EXAMPLE } from "@shared/dto-examples";
import { Type } from "class-transformer";
import { IsEnum, IsInt, IsOptional, IsString, Min } from "class-validator";

// Tenant-wide filters. Admin can scope by any memberId; super-admin too.
// Self-service uses my-pledge-filters.request.ts which omits memberId.
export class PledgeFiltersRequestDto {
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
