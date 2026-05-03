import { ApiPropertyOptional } from "@nestjs/swagger";
import { PledgeStatus } from "@prisma/client";
import { AMOUNT_EXAMPLE, STRING_EXAMPLE } from "@shared/dto-examples";
import { IsEnum, IsNumber, IsOptional, IsString, Min } from "class-validator";

// Members can edit pledgedAmount / status / note on their own pledge.
// campaignId / campaignItemId / memberId remain immutable once created.
export class UpdateMyPledgeRequestDto {
	@ApiPropertyOptional({ example: AMOUNT_EXAMPLE })
	@IsOptional()
	@IsNumber({ maxDecimalPlaces: 2 })
	@Min(0)
	pledgedAmount?: number;

	@ApiPropertyOptional({ enum: PledgeStatus })
	@IsOptional()
	@IsEnum(PledgeStatus)
	status?: PledgeStatus;

	@ApiPropertyOptional({ example: STRING_EXAMPLE })
	@IsOptional()
	@IsString()
	note?: string;
}
