import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { MemberRole, MemberStatus } from "@prisma/client";
import { Expose } from "class-transformer";

import {
	ADDRESS_EXAMPLE,
	DATE_UTC_EXAMPLE,
	EMAIL_EXAMPLE,
	FIREBASE_UID_EXAMPLE,
	FIRST_NAME_EXAMPLE,
	ID_EXAMPLE,
	LAST_NAME_EXAMPLE,
	PHONE_NUMBER_EXAMPLE,
} from "../dto-examples";

export class MemberDto {
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
			"Linked User.id if the member has a registered account; null for temp members",
	})
	userId!: string | null;

	@Expose()
	@ApiProperty({ example: FIRST_NAME_EXAMPLE })
	firstName!: string;

	@Expose()
	@ApiProperty({ example: LAST_NAME_EXAMPLE })
	lastName!: string;

	@Expose()
	@ApiPropertyOptional({ example: EMAIL_EXAMPLE, nullable: true })
	email!: string | null;

	@Expose()
	@ApiPropertyOptional({ example: PHONE_NUMBER_EXAMPLE, nullable: true })
	phone!: string | null;

	@Expose()
	@ApiPropertyOptional({ example: ADDRESS_EXAMPLE, nullable: true })
	address!: string | null;

	@Expose()
	@ApiProperty({ enum: MemberRole, example: MemberRole.USER })
	role!: MemberRole;

	@Expose()
	@ApiProperty({ enum: MemberStatus, example: MemberStatus.ACTIVE })
	status!: MemberStatus;

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

	@Expose()
	@ApiPropertyOptional({
		example: ID_EXAMPLE,
		nullable: true,
		description:
			"Internal User.id of the actor who soft-deleted this row (FK to User). Null when the row was deleted before this column existed, or by a system actor that has no User record.",
	})
	deletedBy!: string | null;

	@Expose()
	@ApiProperty({
		example: false,
		description: "True when this row was soft-deleted by a parent cascade",
	})
	deletedByCascade!: boolean;
}
