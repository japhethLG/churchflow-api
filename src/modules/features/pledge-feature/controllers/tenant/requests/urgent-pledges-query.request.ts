import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsOptional, Max, Min } from "class-validator";

// Query for the admin dashboard's outstanding-pledges card.
// `/pledges/urgent` ALWAYS returns active pledges whose resolved deadline
// is past-due, due-soon (≤14d), or on-track-within-30d. Auto-fulfilled
// rows and no-deadline rows are excluded server-side.
export class UrgentPledgesQueryRequestDto {
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
