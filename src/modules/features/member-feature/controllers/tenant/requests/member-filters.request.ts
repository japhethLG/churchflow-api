import { ApiPropertyOptional, IntersectionType } from "@nestjs/swagger";
import { MemberStatus } from "@prisma/client";
import { PaginationRequestDto } from "@shared/dto/pagination.request.dto";
import { StateFilterRequestDto } from "@shared/dto/state-filter.request.dto";
import { IsEnum, IsOptional, IsString } from "class-validator";

export class MemberFiltersRequestDto extends IntersectionType(
	StateFilterRequestDto,
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
