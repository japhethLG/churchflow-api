import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Expose } from "class-transformer";

import {
	BOOLEAN_EXAMPLE,
	DATE_UTC_EXAMPLE,
	EMAIL_EXAMPLE,
	FIREBASE_UID_EXAMPLE,
	FULL_NAME_EXAMPLE,
	ID_EXAMPLE,
	URL_EXAMPLE,
} from "../dto-examples";

export class UserDto {
	@Expose()
	@ApiProperty({ example: ID_EXAMPLE })
	id!: string;

	@Expose()
	@ApiProperty({ example: FIREBASE_UID_EXAMPLE })
	firebaseUid!: string;

	@Expose()
	@ApiProperty({ example: EMAIL_EXAMPLE })
	email!: string;

	@Expose()
	@ApiProperty({ example: FULL_NAME_EXAMPLE })
	displayName!: string;

	@Expose()
	@ApiPropertyOptional({ example: URL_EXAMPLE, nullable: true })
	photoUrl!: string | null;

	@Expose()
	@ApiProperty({ example: BOOLEAN_EXAMPLE })
	isSuperAdmin!: boolean;

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
