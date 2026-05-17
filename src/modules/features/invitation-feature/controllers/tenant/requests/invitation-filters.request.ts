import { ApiPropertyOptional, IntersectionType } from "@nestjs/swagger";
import { InvitationStatus, MemberRole } from "@prisma/client";
import { DateRangeRequestDto } from "@shared/dto/date-range.request.dto";
import { PaginationRequestDto } from "@shared/dto/pagination.request.dto";
import { IsEnum, IsOptional, IsString } from "class-validator";

// `dateFrom`/`dateTo` (inherited) bracket `createdAt`. All other
// fields are optional — defaults return every invitation for the
// tenant, newest first.
export class InvitationFiltersRequestDto extends IntersectionType(
	DateRangeRequestDto,
	PaginationRequestDto,
) {
	@ApiPropertyOptional({ enum: InvitationStatus })
	@IsOptional()
	@IsEnum(InvitationStatus)
	status?: InvitationStatus;

	@ApiPropertyOptional({ enum: MemberRole })
	@IsOptional()
	@IsEnum(MemberRole)
	role?: MemberRole;

	@ApiPropertyOptional({
		description: "Case-insensitive substring match on invitee email.",
	})
	@IsOptional()
	@IsString()
	search?: string;
}
