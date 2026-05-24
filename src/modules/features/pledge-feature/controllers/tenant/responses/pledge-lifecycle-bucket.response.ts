import { ApiProperty } from "@nestjs/swagger";
import { AMOUNT_EXAMPLE } from "@shared/dto-examples";
import { Expose } from "class-transformer";

import { PledgeLifecycle } from "./pledge.response";

export class PledgeLifecycleBucketDto {
	@Expose()
	@ApiProperty({
		example: "on-track",
		enum: ["on-track", "due-soon", "past-due", "no-deadline"],
		description:
			"Aging buckets only cover open pledges. Fulfilled and cancelled are reported via the status breakdown.",
	})
	lifecycle!: PledgeLifecycle;

	@Expose()
	@ApiProperty({ example: 7 })
	count!: number;

	@Expose()
	@ApiProperty({
		example: AMOUNT_EXAMPLE,
		description: "Remaining (pledged - paid) summed across this bucket.",
	})
	outstanding!: number;

	@Expose()
	@ApiProperty({
		example: 0.4,
		description: "Fraction of all open outstanding amount in this bucket.",
	})
	share!: number;
}
