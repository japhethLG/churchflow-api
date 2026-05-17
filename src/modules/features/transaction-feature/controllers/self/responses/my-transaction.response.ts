import { OmitType } from "@nestjs/swagger";
import { TransactionDto } from "@shared/dto/transaction.dto";

export class MyTransactionResponseDto extends OmitType(TransactionDto, [
	"deletedBy",
] as const) {}
