import { ApiProperty } from "@nestjs/swagger";
import { Expose, Type } from "class-transformer";

import { MemberResponseDto } from "./member.response";

export class MergeMembersPreviewResponseDto {
	@Expose()
	@Type(() => MemberResponseDto)
	@ApiProperty({ type: MemberResponseDto })
	keep!: MemberResponseDto;

	@Expose()
	@Type(() => MemberResponseDto)
	@ApiProperty({ type: MemberResponseDto })
	drop!: MemberResponseDto;

	@Expose()
	@ApiProperty({ example: 12 })
	transactionsToMove!: number;

	@Expose()
	@ApiProperty({ example: 3 })
	pledgesToMove!: number;

	@Expose()
	@ApiProperty({
		type: [String],
		enum: ["email", "phone", "address", "userId"],
		example: ["email", "userId"],
	})
	fieldsCopiedFromDrop!: Array<"email" | "phone" | "address" | "userId">;
}
