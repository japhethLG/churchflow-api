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

		// Explicit pool sizing. node-postgres otherwise silently applies
		// max=10, idle=10s, and NO connect/statement timeout — meaning a
		// burst past 10 in-flight queries queues with unbounded wait, the
		// pool drops connections between navigations (cold reconnect tax),
		// and a runaway query can pin a connection forever. All overridable
		// by env so the pool can be tuned to the deployment (and fronted by
		// PgBouncer for multi-instance) without a code change.
		const num = (key: string, fallback: number): number => {
			const raw = configService.get<string>(key);
			const parsed = raw === undefined ? Number.NaN : Number(raw);
			return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
		};

		super({
			adapter: new PrismaPg({
				connectionString,
				max: num("DATABASE_POOL_MAX", 10),
				idleTimeoutMillis: num("DATABASE_POOL_IDLE_TIMEOUT_MS", 30_000),
				connectionTimeoutMillis: num(
					"DATABASE_POOL_CONNECTION_TIMEOUT_MS",
					5_000,
				),
				// Backstop against a single query pinning a connection. 15s is
				// generous for our aggregates; raise per-deployment if needed.
				statement_timeout: num("DATABASE_STATEMENT_TIMEOUT_MS", 15_000),
			}),
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
