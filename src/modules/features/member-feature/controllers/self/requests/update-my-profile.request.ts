import { ApiPropertyOptional } from "@nestjs/swagger";
import {
	ADDRESS_EXAMPLE,
	FIRST_NAME_EXAMPLE,
	LAST_NAME_EXAMPLE,
	PHONE_NUMBER_EXAMPLE,
} from "@shared/dto-examples";
import { IsOptional, IsString } from "class-validator";

// Members can edit their own contact details and display name. Role +
// status are admin-only and not exposed here. Email is intentionally
// omitted — it is bound to the SSO identity.
export class UpdateMyProfileRequestDto {
	@ApiPropertyOptional({ example: FIRST_NAME_EXAMPLE })
	@IsOptional()
	@IsString()
	firstName?: string;

	@ApiPropertyOptional({ example: LAST_NAME_EXAMPLE })
	@IsOptional()
	@IsString()
	lastName?: string;

	@ApiPropertyOptional({ example: PHONE_NUMBER_EXAMPLE })
	@IsOptional()
	@IsString()
	phone?: string;

	@ApiPropertyOptional({ example: ADDRESS_EXAMPLE })
	@IsOptional()
	@IsString()
	address?: string;
}
