import { ApiProperty } from "@nestjs/swagger";
import { Expose, Type } from "class-transformer";
import { PledgeResponseDto } from "./pledge.response";
import { PledgeListMetaDto } from "./pledge-list-meta.response";

export class PledgeListResponseDto {
	@Expose()
	@Type(() => PledgeResponseDto)
	@ApiProperty({ type: [PledgeResponseDto] })
	items!: PledgeResponseDto[];

	@Expose()
	@Type(() => PledgeListMetaDto)
	@ApiProperty({ type: PledgeListMetaDto })
	meta!: PledgeListMetaDto;
}
