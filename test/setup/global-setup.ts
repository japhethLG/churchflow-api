import { execSync } from "node:child_process";

import {
	PostgreSqlContainer,
	type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";

/**
 * Vitest global setup — runs ONCE before the entire test run.
 *
 * Starts an ephemeral Postgres 16 container, applies all Prisma migrations
 * against it, and exposes the connection string to test files via
 * `process.env.DATABASE_URL`. The container is torn down when Vitest exits.
 *
 * Test files share this single container; per-test isolation is handled by
 * truncating tables in `beforeEach` (see [test/helpers/db.ts](../helpers/db.ts)).
 */

let container: StartedPostgreSqlContainer | undefined;

export async function setup(): Promise<void> {
	container = await new PostgreSqlContainer("postgres:16-alpine")
		.withDatabase("church_app_test")
		.withUsername("test")
		.withPassword("test")
		.start();

	const url = container.getConnectionUri();
	process.env.DATABASE_URL = url;

	// Apply the actual migration chain — this exercises the migration files
	// the same way production deploys do, so a broken migration fails the
	// test suite rather than only the prod deploy.
	//
	// `migrate deploy` reads DATABASE_URL from the prisma config. We set
	// it explicitly on the subprocess env so prisma.config.ts's
	// dotenv-loaded value (which points at the dev DB) is ignored —
	// dotenv does not override pre-set env vars by default.
	execSync(`npx prisma migrate deploy`, {
		env: { ...process.env, DATABASE_URL: url },
		stdio: "inherit",
	});
}

export async function teardown(): Promise<void> {
	await container?.stop();
}
