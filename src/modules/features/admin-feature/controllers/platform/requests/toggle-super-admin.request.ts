import { ApiProperty } from "@nestjs/swagger";
import { BOOLEAN_EXAMPLE } from "@shared/dto-examples";
import { IsBoolean } from "class-validator";

export class ToggleSuperAdminRequestDto {
	@ApiProperty({ example: BOOLEAN_EXAMPLE })
	@IsBoolean()
	isSuperAdmin!: boolean;
}
