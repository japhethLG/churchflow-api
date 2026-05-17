import { OmitType } from "@nestjs/swagger";
import { MemberDto } from "@shared/dto/member.dto";

export class MyProfileResponseDto extends OmitType(MemberDto, [
	"deletedBy",
] as const) {}
