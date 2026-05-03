import { ApiProperty } from "@nestjs/swagger";
import { MemberRole } from "@prisma/client";
import { ID_EXAMPLE, TENANT_SLUG_EXAMPLE } from "@shared/dto-examples";
import { Expose } from "class-transformer";

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
