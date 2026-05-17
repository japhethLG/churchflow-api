import { ApiPropertyOptional } from "@nestjs/swagger";
import { StateFilterRequestDto } from "@shared/dto/state-filter.request.dto";
import {
	BOOLEAN_EXAMPLE,
	EMAIL_EXAMPLE,
	ID_EXAMPLE,
	INT_EXAMPLE,
} from "@shared/dto-examples";
import { Type } from "class-transformer";
import {
	IsBoolean,
	IsInt,
	IsOptional,
	IsString,
	Max,
	Min,
} from "class-validator";

export class AdminUsersQueryDto extends StateFilterRequestDto {
	@ApiPropertyOptional({
		example: EMAIL_EXAMPLE,
		description: "Filter by email or displayName (case-insensitive)",
	})
	@IsOptional()
	@IsString()
	search?: string;

	@ApiPropertyOptional({
		example: ID_EXAMPLE,
		description: "Filter users who are members of this tenant",
	})
	@IsOptional()
	@IsString()
	tenantId?: string;

	@ApiPropertyOptional({
		example: BOOLEAN_EXAMPLE,
		description: "When true, return only super-admin users",
	})
	@IsOptional()
	@IsBoolean()
	@Type(() => Boolean)
	superAdminOnly?: boolean;

	@ApiPropertyOptional({ example: INT_EXAMPLE })
	@IsOptional()
	@IsInt()
	@Min(0)
	@Type(() => Number)
	skip?: number;

	@ApiPropertyOptional({ example: INT_EXAMPLE })
	@IsOptional()
	@IsInt()
	@Min(1)
	@Max(100)
	@Type(() => Number)
	take?: number;
}
