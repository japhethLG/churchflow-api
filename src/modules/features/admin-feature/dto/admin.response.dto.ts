import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { MemberRole } from "@prisma/client";
import {
	AMOUNT_EXAMPLE,
	BOOLEAN_EXAMPLE,
	DATE_UTC_EXAMPLE,
	EMAIL_EXAMPLE,
	FULL_NAME_EXAMPLE,
	ID_EXAMPLE,
	INT_EXAMPLE,
	TENANT_SLUG_EXAMPLE,
	URL_EXAMPLE,
} from "@shared/dto-examples";
import { Expose, Type } from "class-transformer";

export class PlatformStatsDto {
	@Expose()
	@ApiProperty({
		example: INT_EXAMPLE,
		description: "Total non-deleted tenants",
	})
	totalTenants!: number;

	@Expose()
	@ApiProperty({
		example: INT_EXAMPLE,
		description: "Tenants created in the current calendar month",
	})
	createdThisMonth!: number;

	@Expose()
	@ApiProperty({
		example: INT_EXAMPLE,
		description: "Total non-deleted super-admin users",
	})
	superAdmins!: number;

	@Expose()
	@ApiProperty({
		example: INT_EXAMPLE,
		description: "Total members with ADMIN role across all tenants",
	})
	totalAdmins!: number;

	@Expose()
	@ApiProperty({
		example: INT_EXAMPLE,
		description: "Total non-deleted members across all tenants",
	})
	totalMembers!: number;

	@Expose()
	@ApiProperty({
		example: INT_EXAMPLE,
		description: "New members in the current calendar month",
	})
	newMembersThisMonth!: number;

	@Expose()
	@ApiProperty({
		example: INT_EXAMPLE,
		description: "Gift transactions in the last 30 days",
	})
	giftsLast30dCount!: number;

	@Expose()
	@ApiProperty({
		example: AMOUNT_EXAMPLE,
		description: "Total gift amount in the last 30 days",
	})
	giftsLast30dTotal!: number;
}

export class AdminUserMembershipDto {
	@Expose()
	@ApiProperty({ example: ID_EXAMPLE })
	tenantId!: string;

	@Expose()
	@ApiProperty({ example: TENANT_SLUG_EXAMPLE })
	tenantSlug!: string;

	@Expose()
	@ApiProperty({ example: "Grace Community Church" })
	tenantName!: string;

	@Expose()
	@ApiProperty({ example: ID_EXAMPLE })
	memberId!: string;

	@Expose()
	@ApiProperty({ enum: MemberRole, example: MemberRole.ADMIN })
	role!: MemberRole;
}

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

export class AdminUserListResponseDto {
	@Expose()
	@Type(() => AdminUserDto)
	@ApiProperty({ type: [AdminUserDto] })
	items!: AdminUserDto[];

	@Expose()
	@ApiProperty({ example: INT_EXAMPLE })
	total!: number;
}
