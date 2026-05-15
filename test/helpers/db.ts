import {
	PrismaClientService,
	withSoftDeleteProxy,
} from "@infrastructure/prisma-client/prisma-client.service";
import { ConfigService } from "@nestjs/config";

/**
 * Integration-test helpers backed by the shared Postgres container started
 * in [global-setup.ts](../setup/global-setup.ts).
 *
 * `makeTestClient()` constructs a real `PrismaClientService` wrapped with
 * the soft-delete proxy — same code path production uses. The container's
 * `DATABASE_URL` is read from `process.env` (set by global setup).
 *
 * `truncateAll(prisma)` wipes every table between tests so each test sees
 * a clean DB without paying the cost of a fresh container or re-running
 * migrations.
 */

export function makeTestClient(): PrismaClientService {
	const configService = {
		get: (key: string) =>
			key === "DATABASE_URL" ? process.env.DATABASE_URL : undefined,
	} as unknown as ConfigService;

	const base = new PrismaClientService(configService);
	return withSoftDeleteProxy(base);
}

const TABLES_IN_TRUNCATE_ORDER = [
	"AuditEvent",
	"Transaction",
	"Pledge",
	"CampaignItem",
	"Campaign",
	"Invitation",
	"Member",
	"User",
	"Tenant",
];

export async function truncateAll(prisma: PrismaClientService): Promise<void> {
	const list = TABLES_IN_TRUNCATE_ORDER.map((t) => `"${t}"`).join(", ");
	await prisma.$executeRawUnsafe(
		`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`,
	);
}
