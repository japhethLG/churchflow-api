import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { InvitationDto } from "@shared/dto/invitation.dto";
import { Expose } from "class-transformer";

export class LookupInvitationResponseDto extends InvitationDto {
	@Expose()
	@ApiProperty({ example: "Grace Community Church" })
	tenantName!: string;

	@Expose()
	@ApiProperty({ example: "grace-community" })
	tenantSlug!: string;

	@Expose()
	@ApiPropertyOptional({ nullable: true, example: "Pastor David Obi" })
	inviterDisplayName!: string | null;
}
