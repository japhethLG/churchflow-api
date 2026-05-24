import { PickType } from "@nestjs/swagger";
import { MemberDto } from "@shared/dto/member.dto";

// Compact member snapshot embedded on each transaction list/detail row so
// the FE can render the giver's name without prefetching the entire member
// list. `deletedAt` is included so the FE can render a `DeletedLabel`
// when the member was archived after recording the gift.
export class TransactionMemberDto extends PickType(MemberDto, [
	"id",
	"firstName",
	"lastName",
	"deletedAt",
] as const) {}
