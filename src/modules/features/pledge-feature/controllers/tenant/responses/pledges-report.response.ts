import { ApiProperty } from "@nestjs/swagger";
import { AMOUNT_EXAMPLE } from "@shared/dto-examples";
import { Expose, Type } from "class-transformer";

import { PledgeLifecycleBucketDto } from "./pledge-lifecycle-bucket.response";
import { PledgeStatusBucketDto } from "./pledge-status-bucket.response";

// Cohort-style pledge report. All metrics are derived from pledges
// whose `createdAt` falls in the requested date range. "How are this
// year's pledges performing?" is the canonical question this answers.
export class PledgesReportResponseDto {
	@Expose()
	@ApiProperty({
		example: AMOUNT_EXAMPLE,
		description: "Sum of pledgedAmount across the cohort.",
	})
	totalPledged!: number;

	@Expose()
	@ApiProperty({
		example: AMOUNT_EXAMPLE,
		description: "Sum of payments received against the cohort.",
	})
	totalPaid!: number;

	@Expose()
	@ApiProperty({
		example: AMOUNT_EXAMPLE,
		description: "Sum of remaining amounts across the cohort.",
	})
	totalRemaining!: number;

	@Expose()
	@ApiProperty({
		example: 0.75,
		description: "totalPaid / totalPledged (0..1).",
	})
	fulfillmentPct!: number;

	@Expose()
	@ApiProperty({ example: 42 })
	totalCount!: number;

	@Expose()
	@Type(() => PledgeStatusBucketDto)
	@ApiProperty({ type: [PledgeStatusBucketDto] })
	statusBreakdown!: PledgeStatusBucketDto[];

	@Expose()
	@Type(() => PledgeLifecycleBucketDto)
	@ApiProperty({
		type: [PledgeLifecycleBucketDto],
		description:
			"Aging breakdown across open (non-fulfilled, non-cancelled) pledges in the cohort.",
	})
	aging!: PledgeLifecycleBucketDto[];
}
