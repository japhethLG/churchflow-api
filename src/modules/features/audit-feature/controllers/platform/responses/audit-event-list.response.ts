import { ApiProperty } from "@nestjs/swagger";
import { MetaDto } from "@shared/dto/meta.dto";
import { Expose, Type } from "class-transformer";

import { AuditEventResponseDto } from "./audit-event.response";

export class AuditEventListResponseDto {
	@Expose()
	@Type(() => AuditEventResponseDto)
	@ApiProperty({ type: [AuditEventResponseDto] })
	items!: AuditEventResponseDto[];

	@Expose()
	@Type(() => MetaDto)
	@ApiProperty({ type: MetaDto })
	meta!: MetaDto;
}
