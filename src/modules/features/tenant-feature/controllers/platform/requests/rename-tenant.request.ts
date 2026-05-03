import { ApiProperty } from "@nestjs/swagger";
import { TENANT_SLUG_EXAMPLE } from "@shared/dto-examples";
import { IsString, Matches } from "class-validator";

const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/;

export class RenameTenantRequestDto {
	@ApiProperty({ example: TENANT_SLUG_EXAMPLE })
	@IsString()
	@Matches(SLUG_REGEX)
	slug!: string;
}
