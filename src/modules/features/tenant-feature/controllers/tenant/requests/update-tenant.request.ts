import { ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import {
	ADDRESS_EXAMPLE,
	CHURCH_NAME_EXAMPLE,
	EMAIL_EXAMPLE,
	PHONE_NUMBER_EXAMPLE,
	URL_EXAMPLE,
} from "@shared/dto-examples";
import { IsArray, IsEmail, IsOptional, IsString, IsUrl } from "class-validator";

// Editable subset of tenant metadata. Slug renames go through the
// platform endpoint so super-admins can manage redirect aliases.
class EditableTenantFields {
	@ApiPropertyOptional({ example: CHURCH_NAME_EXAMPLE })
	@IsOptional()
	@IsString()
	name?: string;

	@ApiPropertyOptional({ example: ADDRESS_EXAMPLE })
	@IsOptional()
	@IsString()
	address?: string;

	@ApiPropertyOptional({ example: PHONE_NUMBER_EXAMPLE })
	@IsOptional()
	@IsString()
	phone?: string;

	@ApiPropertyOptional({ example: EMAIL_EXAMPLE })
	@IsOptional()
	@IsEmail()
	email?: string;

	@ApiPropertyOptional({ example: URL_EXAMPLE })
	@IsOptional()
	@IsUrl()
	logoUrl?: string;

	@ApiPropertyOptional({
		type: [String],
		example: ["building_fund", "youth_ministry"],
	})
	@IsOptional()
	@IsArray()
	@IsString({ each: true })
	customTransactionTypes?: string[];
}

export class UpdateTenantRequestDto extends PartialType(EditableTenantFields) {}
