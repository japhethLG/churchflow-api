import { OmitType } from "@nestjs/swagger";
import { PledgeDto } from "@shared/dto/pledge.dto";

export class MyPledgeResponseDto extends OmitType(PledgeDto, [
	"deletedBy",
] as const) {}
