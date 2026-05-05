import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { PledgeStatus, Prisma } from "@prisma/client";
import { Expose, Transform } from "class-transformer";

import {
	AMOUNT_EXAMPLE,
	DATE_UTC_EXAMPLE,
	FIREBASE_UID_EXAMPLE,
	ID_EXAMPLE,
	STRING_EXAMPLE,
} from "../dto-examples";

export class PledgeDto {
	@Expose()
	@ApiProperty({ example: ID_EXAMPLE })
	id!: string;

	@Expose()
	@ApiProperty({ example: ID_EXAMPLE })
	tenantId!: string;

	@Expose()
	@ApiProperty({ example: ID_EXAMPLE })
	campaignId!: string;

	@Expose()
	@ApiPropertyOptional({
		example: ID_EXAMPLE,
		nullable: true,
		description:
			"Null = pledge applies to overall campaign, not a specific item",
	})
	campaignItemId!: string | null;

	@Expose()
	@ApiProperty({ example: ID_EXAMPLE })
	memberId!: string;

	@Expose()
	@Transform(({ value }) =>
		value instanceof Prisma.Decimal ? value.toNumber() : value,
	)
	@ApiProperty({ example: AMOUNT_EXAMPLE })
	pledgedAmount!: number;

	@Expose()
	@ApiProperty({ enum: PledgeStatus, example: PledgeStatus.ACTIVE })
	status!: PledgeStatus;

	@Expose()
	@ApiPropertyOptional({ example: STRING_EXAMPLE, nullable: true })
	note!: string | null;

	@Expose()
	@Transform(({ value }) =>
		value instanceof Prisma.Decimal ? value.toNumber() : value,
	)
	@ApiProperty({
		example: AMOUNT_EXAMPLE,
		description: "Total paid against this pledge (sum of linked transactions)",
	})
	paidAmount!: number;

	@Expose()
	@Transform(({ value }) =>
		value instanceof Prisma.Decimal ? value.toNumber() : value,
	)
	@ApiProperty({
		example: AMOUNT_EXAMPLE,
		description:
			"Remaining to fulfill this pledge (pledgedAmount − paidAmount, min 0)",
	})
	remainingAmount!: number;

	@Expose()
	@ApiProperty({ example: FIREBASE_UID_EXAMPLE })
	createdBy!: string;

	@Expose()
	@ApiProperty({ example: DATE_UTC_EXAMPLE })
	createdAt!: Date;

	@Expose()
	@ApiProperty({ example: DATE_UTC_EXAMPLE })
	updatedAt!: Date;
}
