import { ApiPropertyOptional, IntersectionType } from "@nestjs/swagger";
import { DateRangeRequestDto } from "@shared/dto/date-range.request.dto";
import { Type } from "class-transformer";
import { IsInt, IsOptional, Max, Min } from "class-validator";

// Query for the admin dashboard's outstanding-pledges card.
// `/pledges/urgent` returns active pledges whose resolved deadline is
// past-due, due-soon (≤14d), or on-track-within-30d. Auto-fulfilled
// rows and no-deadline rows are excluded server-side.
//
// `dateFrom`/`dateTo` (inherited from DateRangeRequestDto) bracket
// `Pledge.createdAt` — same cohort semantic as the Reports page. Lets
// admins scope the urgent card to e.g. YTD pledges. Both bounds are
// optional; omit for the all-time urgent list.
export class UrgentPledgesQueryRequestDto extends IntersectionType(
	DateRangeRequestDto,
) {
	@ApiPropertyOptional({
		example: 8,
		minimum: 1,
		maximum: 200,
		description: "Max rows to return (default 50).",
	})
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	@Max(200)
	limit?: number;
}
