import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
	BOOLEAN_EXAMPLE,
	DATE_UTC_EXAMPLE,
	EMAIL_EXAMPLE,
	FULL_NAME_EXAMPLE,
	ID_EXAMPLE,
	URL_EXAMPLE,
} from "@shared/dto-examples";
import { Expose, Type } from "class-transformer";

import { AdminUserMembershipDto } from "./admin-user-membership.response";

export class AdminUserDto {
	@Expose()
	@ApiProperty({ example: ID_EXAMPLE })
	id!: string;

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
	@Type(() => AdminUserMembershipDto)
	@ApiProperty({ type: [AdminUserMembershipDto] })
	memberships!: AdminUserMembershipDto[];

	@Expose()
	@ApiProperty({ example: DATE_UTC_EXAMPLE })
	createdAt!: Date;
}
