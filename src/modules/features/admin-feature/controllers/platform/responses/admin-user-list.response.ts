import { ApiProperty } from "@nestjs/swagger";
import { INT_EXAMPLE } from "@shared/dto-examples";
import { Expose, Type } from "class-transformer";

import { AdminUserDto } from "./admin-user.response";

export class AdminUserListResponseDto {
	@Expose()
	@Type(() => AdminUserDto)
	@ApiProperty({ type: [AdminUserDto] })
	items!: AdminUserDto[];

	@Expose()
	@ApiProperty({ example: INT_EXAMPLE })
	total!: number;
}
