import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { PledgeStatus } from "@prisma/client";
import {
	AMOUNT_EXAMPLE,
	ID_EXAMPLE,
	STRING_EXAMPLE,
} from "@shared/dto-examples";
import {
	IsEnum,
	IsNumber,
	IsOptional,
	IsString,
	Min,
} from "class-validator";

// Tenant-management intent: an admin creates a pledge on behalf of a
// specific member (memberId is required and may be any member in the
// tenant). Members use the /me/pledges endpoint instead.
export class CreatePledgeRequestDto {
	@ApiProperty({ example: ID_EXAMPLE })
	@IsString()
	campaignId!: string;

	@ApiPropertyOptional({
		example: ID_EXAMPLE,
		description:
			"Omit to pledge against the overall campaign, not a specific item",
	})
	@IsOptional()
	@IsString()
	campaignItemId?: string;

	@ApiProperty({ example: ID_EXAMPLE })
	@IsString()
	memberId!: string;

	@ApiProperty({ example: AMOUNT_EXAMPLE })
	@IsNumber({ maxDecimalPlaces: 2 })
	@Min(0)
	pledgedAmount!: number;

	@ApiPropertyOptional({ enum: PledgeStatus })
	@IsOptional()
	@IsEnum(PledgeStatus)
	status?: PledgeStatus;

	@ApiPropertyOptional({ example: STRING_EXAMPLE })
	@IsOptional()
	@IsString()
	note?: string;
}
