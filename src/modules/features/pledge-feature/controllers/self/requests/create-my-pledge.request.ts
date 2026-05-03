import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { PledgeStatus } from "@prisma/client";
import {
	AMOUNT_EXAMPLE,
	ID_EXAMPLE,
	STRING_EXAMPLE,
} from "@shared/dto-examples";
import { IsEnum, IsNumber, IsOptional, IsString, Min } from "class-validator";

// Self-service intent: a member pledges on their own behalf. memberId is
// implicit (resolved from the authenticated tenant context) and therefore
// is NOT part of this request shape — admins use the tenant endpoint to
// pledge on behalf of others.
export class CreateMyPledgeRequestDto {
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
