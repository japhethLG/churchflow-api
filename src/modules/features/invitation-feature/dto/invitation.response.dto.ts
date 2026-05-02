import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { InvitationDto } from "@shared/dto/invitation.dto";
import { Expose, Type } from "class-transformer";

export class InvitationResponseDto extends InvitationDto {}

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

export class InvitationListResponseDto {
	@Expose()
	@Type(() => InvitationResponseDto)
	@ApiProperty({ type: [InvitationResponseDto] })
	items!: InvitationResponseDto[];
}
