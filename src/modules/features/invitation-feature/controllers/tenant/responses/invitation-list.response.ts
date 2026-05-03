import { ApiProperty } from "@nestjs/swagger";
import { Expose, Type } from "class-transformer";

import { InvitationResponseDto } from "./invitation.response";

export class InvitationListResponseDto {
	@Expose()
	@Type(() => InvitationResponseDto)
	@ApiProperty({ type: [InvitationResponseDto] })
	items!: InvitationResponseDto[];
}
