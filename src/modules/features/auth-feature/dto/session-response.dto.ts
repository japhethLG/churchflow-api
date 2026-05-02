import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { MemberRole } from "@prisma/client";
import { UserDto } from "@shared/dto/user.dto";

import {
	CHURCH_NAME_EXAMPLE,
	EMAIL_EXAMPLE,
	FIREBASE_UID_EXAMPLE,
	ID_EXAMPLE,
	TENANT_SLUG_EXAMPLE,
	URL_EXAMPLE,
} from "@shared/dto-examples";
import { Expose, Type } from "class-transformer";

export class TenantMembershipDto {
	@Expose()
	@ApiProperty({ example: ID_EXAMPLE })
	tenantId!: string;

	@Expose()
	@ApiProperty({
		example: TENANT_SLUG_EXAMPLE,
		description:
			"URL-safe tenant slug — used in frontend paths and as the key for tenantMemberships claims.",
	})
	slug!: string;

	@Expose()
	@ApiProperty({ example: CHURCH_NAME_EXAMPLE })
	name!: string;

	@Expose()
	@ApiProperty({ example: ID_EXAMPLE })
	memberId!: string;

	@Expose()
	@ApiProperty({ enum: MemberRole, example: MemberRole.ADMIN })
	role!: MemberRole;
}

export class SessionResponseDto {
	@Expose()
	@Type(() => UserDto)
	@ApiProperty({ type: UserDto })
	user!: UserDto;

	@Expose()
	@Type(() => TenantMembershipDto)
	@ApiProperty({ type: [TenantMembershipDto] })
	tenantMemberships!: TenantMembershipDto[];

	@Expose()
	@ApiProperty({ example: false })
	isSuperAdmin!: boolean;
}

// Shape of /api/v1/auth/me — the decoded Firebase token for the current
// request, normalised into the AuthUser interface.
export class AuthMeResponseDto {
	@Expose()
	@ApiProperty({ example: FIREBASE_UID_EXAMPLE })
	firebaseUid!: string;

	@Expose()
	@ApiProperty({ example: EMAIL_EXAMPLE })
	email!: string;

	@Expose()
	@ApiPropertyOptional({ example: "John Doe" })
	displayName?: string;

	@Expose()
	@ApiPropertyOptional({ example: URL_EXAMPLE })
	picture?: string;

	@Expose()
	@ApiProperty({ example: false })
	isSuperAdmin!: boolean;

	@Expose()
	@ApiProperty({
		description:
			"Map of tenant-slug → { memberId, role }. Keys are slugs so frontend URLs can be used as-is.",
		example: {
			[TENANT_SLUG_EXAMPLE]: { memberId: ID_EXAMPLE, role: MemberRole.ADMIN },
		},
		additionalProperties: {
			type: "object",
			properties: {
				memberId: { type: "string", example: ID_EXAMPLE },
				role: { enum: Object.values(MemberRole) },
			},
		},
	})
	tenantMemberships!: Record<string, { memberId: string; role: MemberRole }>;
}
