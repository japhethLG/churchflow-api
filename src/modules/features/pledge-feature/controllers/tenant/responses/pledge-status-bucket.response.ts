import { ApiProperty } from "@nestjs/swagger";
import { PledgeStatus } from "@prisma/client";
import { AMOUNT_EXAMPLE } from "@shared/dto-examples";
import { Expose } from "class-transformer";

export class PledgeStatusBucketDto {
	@Expose()
	@ApiProperty({ enum: PledgeStatus })
	status!: PledgeStatus;

	@Expose()
	@ApiProperty({ example: 12 })
	count!: number;

	@Expose()
	@ApiProperty({ example: AMOUNT_EXAMPLE })
	pledged!: number;

	@Expose()
	@ApiProperty({ example: AMOUNT_EXAMPLE })
	paid!: number;
}
