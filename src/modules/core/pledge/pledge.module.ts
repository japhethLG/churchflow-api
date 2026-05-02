import { Module } from "@nestjs/common";

import { PledgeRepository } from "./repository/pledge.repository";
import { PledgeService } from "./services/pledge.service";

@Module({
	providers: [PledgeRepository, PledgeService],
	exports: [PledgeService],
})
export class PledgeCoreModule {}
