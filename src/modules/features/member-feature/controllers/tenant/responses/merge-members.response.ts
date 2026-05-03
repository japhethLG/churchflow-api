import { ApiProperty } from "@nestjs/swagger";
import { Expose, Type } from "class-transformer";

import { MemberResponseDto } from "./member.response";
import { MergeMembersPreviewResponseDto } from "./merge-members-preview.response";

export class MergeMembersResponseDto extends MergeMembersPreviewResponseDto {
	@Expose()
	@Type(() => MemberResponseDto)
	@ApiProperty({ type: MemberResponseDto })
	merged!: MemberResponseDto;
}
