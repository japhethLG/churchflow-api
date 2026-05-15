import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Prisma, TransactionType } from "@prisma/client";
import { Expose, Transform } from "class-transformer";

import {
	AMOUNT_EXAMPLE,
	DATE_UTC_EXAMPLE,
	FIREBASE_UID_EXAMPLE,
	ID_EXAMPLE,
	REFERENCE_NUMBER_EXAMPLE,
	STRING_EXAMPLE,
} from "../dto-examples";

export class TransactionDto {
	@Expose()
	@ApiProperty({ example: ID_EXAMPLE })
	id!: string;

	@Expose()
	@ApiProperty({ example: ID_EXAMPLE })
	tenantId!: string;

	@Expose()
	@ApiPropertyOptional({
		example: ID_EXAMPLE,
		nullable: true,
		description:
			"Member this transaction belongs to (null = anonymous/unlinked)",
	})
	memberId!: string | null;

	@Expose()
	@ApiPropertyOptional({
		example: ID_EXAMPLE,
		nullable: true,
		description: "Campaign this gift is attributed to (null = no campaign)",
	})
	campaignId!: string | null;

	@Expose()
	@ApiPropertyOptional({
		example: ID_EXAMPLE,
		nullable: true,
		description:
			"Campaign item this gift is earmarked to (null = general to campaign)",
	})
	campaignItemId!: string | null;

	@Expose()
	@ApiPropertyOptional({
		example: ID_EXAMPLE,
		nullable: true,
		description:
			"Pledge this payment fulfills (null = not against a specific pledge)",
	})
	pledgeId!: string | null;

	@Expose()
	@ApiProperty({ enum: TransactionType, example: TransactionType.TITHE })
	type!: TransactionType;

	@Expose()
	@ApiPropertyOptional({
		example: STRING_EXAMPLE,
		nullable: true,
		description:
			"Only set when type is OTHER and the tenant has defined custom types",
	})
	customType!: string | null;

	@Expose()
	@Transform(({ value }) =>
		value instanceof Prisma.Decimal ? value.toNumber() : value,
	)
	@ApiProperty({
		example: AMOUNT_EXAMPLE,
		description: "Positive decimal (2 places)",
	})
	amount!: number;

	@Expose()
	@ApiProperty({ example: DATE_UTC_EXAMPLE })
	date!: Date;

	@Expose()
	@ApiPropertyOptional({ example: STRING_EXAMPLE, nullable: true })
	note!: string | null;

	@Expose()
	@ApiPropertyOptional({ example: REFERENCE_NUMBER_EXAMPLE, nullable: true })
	referenceNumber!: string | null;

	@Expose()
	@ApiProperty({ example: FIREBASE_UID_EXAMPLE })
	createdBy!: string;

	@Expose()
	@ApiProperty({ example: DATE_UTC_EXAMPLE })
	createdAt!: Date;

	@Expose()
	@ApiProperty({ example: DATE_UTC_EXAMPLE })
	updatedAt!: Date;

	@Expose()
	@ApiPropertyOptional({ example: DATE_UTC_EXAMPLE, nullable: true })
	deletedAt!: Date | null;
}
