import { ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { MemberStatus } from "@prisma/client";
import { IsEnum, IsOptional } from "class-validator";

import { CreateMemberRequestDto } from "./create-member.request";

export class UpdateMemberRequestDto extends PartialType(CreateMemberRequestDto) {
	@ApiPropertyOptional({ enum: MemberStatus })
	@IsOptional()
	@IsEnum(MemberStatus)
	status?: MemberStatus;
}
