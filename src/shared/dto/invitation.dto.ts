import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { InvitationStatus, MemberRole } from "@prisma/client";
import { Expose } from "class-transformer";

import {
	DATE_UTC_EXAMPLE,
	EMAIL_EXAMPLE,
	FIREBASE_UID_EXAMPLE,
	ID_EXAMPLE,
	TOKEN_EXAMPLE,
} from "../dto-examples";

export class InvitationDto {
	@Expose()
	@ApiProperty({ example: ID_EXAMPLE })
	id!: string;

	@Expose()
	@ApiProperty({ example: ID_EXAMPLE })
	tenantId!: string;

	@Expose()
	@ApiProperty({ example: EMAIL_EXAMPLE })
	email!: string;

	@Expose()
	@ApiProperty({ enum: MemberRole, example: MemberRole.USER })
	role!: MemberRole;

	@Expose()
	@ApiPropertyOptional({
		example: ID_EXAMPLE,
		nullable: true,
		description: "Member this invitation links to on acceptance",
	})
	memberId!: string | null;

	@Expose()
	@ApiProperty({ enum: InvitationStatus, example: InvitationStatus.PENDING })
	status!: InvitationStatus;

	@Expose()
	@ApiProperty({ example: TOKEN_EXAMPLE })
	token!: string;

	@Expose()
	@ApiProperty({ example: FIREBASE_UID_EXAMPLE })
	invitedBy!: string;

	@Expose()
	@ApiProperty({ example: DATE_UTC_EXAMPLE })
	expiresAt!: Date;

	@Expose()
	@ApiPropertyOptional({ example: DATE_UTC_EXAMPLE, nullable: true })
	acceptedAt!: Date | null;

	@Expose()
	@ApiProperty({ example: DATE_UTC_EXAMPLE })
	createdAt!: Date;

	@Expose()
	@ApiProperty({ example: DATE_UTC_EXAMPLE })
	updatedAt!: Date;
}
