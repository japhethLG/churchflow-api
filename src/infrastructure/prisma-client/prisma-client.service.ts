import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

import { softDeleteExtension } from "./soft-delete";

@Injectable()
export class PrismaClientService
	extends PrismaClient
	implements OnModuleInit, OnModuleDestroy
{
	constructor(configService: ConfigService) {
		const connectionString = configService.get<string>("DATABASE_URL");

		if (!connectionString) {
			throw new Error("DATABASE_URL is not configured");
		}

		super({
			adapter: new PrismaPg({ connectionString }),
		});
	}

	async onModuleInit(): Promise<void> {
		await this.$connect();
	}

	async onModuleDestroy(): Promise<void> {
		await this.$disconnect();
	}
}

/**
 * Wrap a PrismaClientService instance with a proxy that routes model
 * accessors and `$transaction` through the soft-delete extension while
 * keeping NestJS lifecycle methods (`onModuleInit`, `onModuleDestroy`)
 * intact on the original instance.
 *
 * Used by [prisma-client.module.ts](./prisma-client.module.ts) so that
 * every repository that injects `PrismaClientService` transparently gets
 * the extended behavior — no per-repo migration needed.
 */
export function withSoftDeleteProxy(
	base: PrismaClientService,
): PrismaClientService {
	const extended = base.$extends(softDeleteExtension);

	return new Proxy(base, {
		get(target, prop, receiver) {
			const fromExtended = (
				extended as unknown as Record<PropertyKey, unknown>
			)[prop];
			if (fromExtended !== undefined) {
				return typeof fromExtended === "function"
					? (fromExtended as (...a: unknown[]) => unknown).bind(extended)
					: fromExtended;
			}
			return Reflect.get(target, prop, receiver);
		},
	}) as PrismaClientService;
}
