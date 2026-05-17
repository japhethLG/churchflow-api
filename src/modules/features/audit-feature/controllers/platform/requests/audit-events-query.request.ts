import {
	ApiPropertyOptional,
	IntersectionType,
	OmitType,
} from "@nestjs/swagger";
import { AuditAction } from "@prisma/client";
import { DateRangeRequestDto } from "@shared/dto/date-range.request.dto";
import { PaginationRequestDto } from "@shared/dto/pagination.request.dto";
import { FIREBASE_UID_EXAMPLE, ID_EXAMPLE } from "@shared/dto-examples";
import { Type } from "class-transformer";
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

// Filters for the platform audit log. All optional — defaults return the
// most recent events across the whole platform. `dateFrom`/`dateTo`
// (inherited) bracket `createdAt`. `limit` is omitted from the shared
// pagination base and redeclared locally so we can cap it at 200.
export class AuditEventsQueryRequestDto extends IntersectionType(
	DateRangeRequestDto,
	OmitType(PaginationRequestDto, ["limit"] as const),
) {
	@ApiPropertyOptional({
		example: ID_EXAMPLE,
		description: "Narrow to a single tenant.",
	})
	@IsOptional()
	@IsString()
	tenantId?: string;

	@ApiPropertyOptional({
		example: "Campaign",
		description: 'Entity type — e.g. "Campaign", "Pledge".',
	})
	@IsOptional()
	@IsString()
	entity?: string;

	@ApiPropertyOptional({ example: ID_EXAMPLE })
	@IsOptional()
	@IsString()
	entityId?: string;

	@ApiPropertyOptional({ example: FIREBASE_UID_EXAMPLE })
	@IsOptional()
	@IsString()
	actorUid?: string;

	@ApiPropertyOptional({ enum: AuditAction })
	@IsOptional()
	@IsEnum(AuditAction)
	action?: AuditAction;

	@ApiPropertyOptional({ example: 50, maximum: 200 })
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	@Max(200)
	limit?: number;
}
