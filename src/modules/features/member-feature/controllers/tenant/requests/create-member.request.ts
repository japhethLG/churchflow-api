import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { MemberRole } from "@prisma/client";
import {
	ADDRESS_EXAMPLE,
	EMAIL_EXAMPLE,
	FIRST_NAME_EXAMPLE,
	LAST_NAME_EXAMPLE,
	PHONE_NUMBER_EXAMPLE,
} from "@shared/dto-examples";
import { IsEmail, IsEnum, IsOptional, IsString } from "class-validator";

export class CreateMemberRequestDto {
	@ApiProperty({ example: FIRST_NAME_EXAMPLE })
	@IsString()
	firstName!: string;

	@ApiProperty({ example: LAST_NAME_EXAMPLE })
	@IsString()
	lastName!: string;

	@ApiPropertyOptional({ example: EMAIL_EXAMPLE })
	@IsOptional()
	@IsEmail()
	email?: string;

	@ApiPropertyOptional({ example: PHONE_NUMBER_EXAMPLE })
	@IsOptional()
	@IsString()
	phone?: string;

	@ApiPropertyOptional({ example: ADDRESS_EXAMPLE })
	@IsOptional()
	@IsString()
	address?: string;

	@ApiPropertyOptional({ enum: MemberRole, default: MemberRole.USER })
	@IsOptional()
	@IsEnum(MemberRole)
	role?: MemberRole;
}
