import { ApiProperty } from "@nestjs/swagger";
import { MetaDto } from "@shared/dto/meta.dto";
import { Expose, Type } from "class-transformer";

import { InvitationResponseDto } from "./invitation.response";

export class InvitationListResponseDto {
	@Expose()
	@Type(() => InvitationResponseDto)
	@ApiProperty({ type: [InvitationResponseDto] })
	items!: InvitationResponseDto[];

	@Expose()
	@Type(() => MetaDto)
	@ApiProperty({ type: MetaDto })
	meta!: MetaDto;
}
