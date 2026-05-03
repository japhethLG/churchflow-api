import { ApiPropertyOptional } from "@nestjs/swagger";
import { CampaignStatus } from "@prisma/client";
import { Type } from "class-transformer";
import { IsEnum, IsInt, IsOptional, Min } from "class-validator";

export class MyCampaignFiltersRequestDto {
	@ApiPropertyOptional({ enum: CampaignStatus })
	@IsOptional()
	@IsEnum(CampaignStatus)
	status?: CampaignStatus;

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
