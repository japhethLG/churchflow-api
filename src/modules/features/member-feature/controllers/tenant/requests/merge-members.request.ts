import { ApiProperty } from "@nestjs/swagger";
import { ID_EXAMPLE } from "@shared/dto-examples";
import { IsString } from "class-validator";

export class MergeMembersRequestDto {
	@ApiProperty({
		example: ID_EXAMPLE,
		description:
			"Id of the member that will be removed; its data is moved into the keeper.",
	})
	@IsString()
	dropId!: string;
}
