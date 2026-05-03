import { PartialType } from "@nestjs/swagger";

import { CreateTransactionRequestDto } from "./create-transaction.request";

export class UpdateTransactionRequestDto extends PartialType(
	CreateTransactionRequestDto,
) {}
