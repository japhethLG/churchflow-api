import { ApiProperty } from "@nestjs/swagger";
import { Expose, Type } from "class-transformer";
import { MyPledgeResponseDto } from "./my-pledge.response";
import { MyPledgeListMetaDto } from "./my-pledge-list-meta.response";

export class MyPledgeListResponseDto {
	@Expose()
	@Type(() => MyPledgeResponseDto)
	@ApiProperty({ type: [MyPledgeResponseDto] })
	items!: MyPledgeResponseDto[];

	@Expose()
	@Type(() => MyPledgeListMetaDto)
	@ApiProperty({ type: MyPledgeListMetaDto })
	meta!: MyPledgeListMetaDto;
}
