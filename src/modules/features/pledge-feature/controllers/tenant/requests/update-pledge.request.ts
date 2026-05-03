import { ApiPropertyOptional } from "@nestjs/swagger";
import { PledgeStatus } from "@prisma/client";
import { AMOUNT_EXAMPLE, STRING_EXAMPLE } from "@shared/dto-examples";
import { IsEnum, IsNumber, IsOptional, IsString, Min } from "class-validator";

// campaignId / campaignItemId / memberId are immutable after create — only
// pledgedAmount / status / note can be edited.
export class UpdatePledgeRequestDto {
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
