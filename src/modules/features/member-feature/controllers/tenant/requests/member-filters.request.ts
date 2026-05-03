import { ApiPropertyOptional } from "@nestjs/swagger";
import { MemberStatus } from "@prisma/client";
import { Type } from "class-transformer";
import { IsEnum, IsInt, IsOptional, IsString, Min } from "class-validator";

export class MemberFiltersRequestDto {
	@ApiPropertyOptional({ enum: MemberStatus })
	@IsOptional()
	@IsEnum(MemberStatus)
	status?: MemberStatus;

	@ApiPropertyOptional()
	@IsOptional()
	@IsString()
	search?: string;

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
