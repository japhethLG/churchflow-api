import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
	FULL_NAME_EXAMPLE,
	ID_EXAMPLE,
	URL_EXAMPLE,
} from "@shared/dto-examples";
import { Expose } from "class-transformer";

export class TenantAdminPreviewDto {
	@Expose()
	@ApiProperty({ example: ID_EXAMPLE })
	memberId!: string;

	@Expose()
	@ApiProperty({ example: FULL_NAME_EXAMPLE })
	displayName!: string;

	@Expose()
	@ApiPropertyOptional({ example: URL_EXAMPLE, nullable: true })
	photoUrl!: string | null;
}
