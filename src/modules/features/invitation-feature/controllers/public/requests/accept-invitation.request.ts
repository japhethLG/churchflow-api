import { ApiProperty } from "@nestjs/swagger";
import { TOKEN_EXAMPLE } from "@shared/dto-examples";
import { IsString } from "class-validator";

export class AcceptInvitationRequestDto {
	@ApiProperty({ example: TOKEN_EXAMPLE })
	@IsString()
	token!: string;
}
