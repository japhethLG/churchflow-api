import { ApiPropertyOptional } from "@nestjs/swagger";
import { PledgeStatus } from "@prisma/client";
import { ID_EXAMPLE } from "@shared/dto-examples";
import { Type } from "class-transformer";
import { IsEnum, IsInt, IsOptional, IsString, Min } from "class-validator";

// Self-service filters. memberId is NOT accepted — the controller pins it
// to the authenticated tenant context. Members may still narrow by
// campaign / campaign item / status.
export class MyPledgeFiltersRequestDto {
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
