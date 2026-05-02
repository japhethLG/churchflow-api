import { ApiProperty } from "@nestjs/swagger";
import { MemberDto } from "@shared/dto/member.dto";
import { MetaDto } from "@shared/dto/meta.dto";
import { Expose, Type } from "class-transformer";

export class MemberResponseDto extends MemberDto {}

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

export class MergeMembersResponseDto extends MergeMembersPreviewResponseDto {
	@Expose()
	@Type(() => MemberResponseDto)
	@ApiProperty({ type: MemberResponseDto })
	merged!: MemberResponseDto;
}
