import { ApiProperty } from "@nestjs/swagger";
import { MetaDto } from "@shared/dto/meta.dto";
import { Expose, Type } from "class-transformer";

import { MemberResponseDto } from "./member.response";

export class MemberListResponseDto {
	@Expose()
	@Type(() => MemberResponseDto)
	@ApiProperty({ type: [MemberResponseDto] })
	items!: MemberResponseDto[];

	@Expose()
	@Type(() => MetaDto)
	@ApiProperty({ type: MetaDto })
	meta!: MetaDto;
}
