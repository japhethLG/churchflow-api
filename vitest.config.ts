import { resolve } from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["test/integration/**/*.integration.test.ts"],
		globalSetup: ["./test/setup/global-setup.ts"],
		hookTimeout: 120_000,
		testTimeout: 30_000,
		fileParallelism: false,
		pool: "forks",
	},
	resolve: {
		alias: {
			"@infrastructure": resolve(__dirname, "src/infrastructure"),
			"@modules": resolve(__dirname, "src/modules"),
			"@shared": resolve(__dirname, "src/shared"),
		},
	},
});
