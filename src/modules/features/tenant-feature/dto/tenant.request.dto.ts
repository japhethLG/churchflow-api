import {
	ApiProperty,
	ApiPropertyOptional,
	OmitType,
	PartialType,
} from "@nestjs/swagger";
import {
	ADDRESS_EXAMPLE,
	CHURCH_NAME_EXAMPLE,
	EMAIL_EXAMPLE,
	PHONE_NUMBER_EXAMPLE,
	TENANT_SLUG_EXAMPLE,
	URL_EXAMPLE,
} from "@shared/dto-examples";
import {
	IsArray,
	IsEmail,
	IsOptional,
	IsString,
	IsUrl,
	Matches,
} from "class-validator";

const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/;

export class CreateTenantRequestDto {
	@ApiProperty({
		example: TENANT_SLUG_EXAMPLE,
		description:
			"URL-safe identifier. Lowercase alphanumerics and hyphens only, 3–64 chars.",
	})
	@IsString()
	@Matches(SLUG_REGEX, {
		message:
			"slug must be 3–64 chars, lowercase alphanumerics and hyphens only, not starting or ending with a hyphen",
	})
	slug!: string;

	@ApiProperty({ example: CHURCH_NAME_EXAMPLE })
	@IsString()
	name!: string;

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

// Update excludes slug — slug renames go through a dedicated endpoint so
// the super-admin flow can handle redirect aliases.
export class UpdateTenantRequestDto extends PartialType(
	OmitType(CreateTenantRequestDto, ["slug"] as const),
) {}

export class RenameTenantRequestDto {
	@ApiProperty({ example: TENANT_SLUG_EXAMPLE })
	@IsString()
	@Matches(SLUG_REGEX)
	slug!: string;
}
