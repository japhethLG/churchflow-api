import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import {
	PrismaClientService,
	withSoftDeleteProxy,
} from "./prisma-client.service";

@Global()
@Module({
	providers: [
		{
			provide: PrismaClientService,
			useFactory: (configService: ConfigService) => {
				const base = new PrismaClientService(configService);
				return withSoftDeleteProxy(base);
			},
			inject: [ConfigService],
		},
	],
	exports: [PrismaClientService],
})
export class PrismaClientModule {}
