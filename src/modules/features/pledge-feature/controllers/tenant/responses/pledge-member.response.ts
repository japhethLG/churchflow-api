import { PickType } from "@nestjs/swagger";
import { MemberDto } from "@shared/dto/member.dto";

// Compact member snapshot embedded on each pledge so list pages don't
// have to prefetch the full member roster just to render row labels.
export class PledgeMemberDto extends PickType(MemberDto, [
	"id",
	"firstName",
	"lastName",
	"deletedAt",
] as const) {}
