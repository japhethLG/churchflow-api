import type { PrismaClientService } from "@infrastructure/prisma-client/prisma-client.service";
import { PledgeRepository } from "@modules/core/pledge/repository/pledge.repository";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { makeTestClient, truncateAll } from "../helpers/db";

/**
 * Integration tests for `Pledge.paidAmount` denormalization.
 *
 * The denormalized column + status auto-transition is load-bearing for
 * `pledgesReport`, `findUrgent`, and `MemberFeatureService.summary` after
 * Phase 2. These tests pin the invariants:
 *
 * - `adjustPaidAmount(delta)` adds atomically.
 * - Crossing the pledgedAmount threshold flips ACTIVE → FULFILLED.
 * - Falling back below threshold flips FULFILLED → ACTIVE.
 * - CANCELLED is never touched by the auto-transition.
 *
 * Runs against the same Postgres container as the other integration tests.
 */

const prisma: PrismaClientService = makeTestClient();
const repo = new PledgeRepository(prisma);

afterAll(async () => {
	await prisma.$disconnect();
});

beforeEach(async () => {
	await truncateAll(prisma);
});

async function seedFixtures() {
	const tenant = await prisma.tenant.create({
		data: { slug: "first-baptist", name: "First Baptist", createdBy: "u" },
		select: { id: true },
	});
	const member = await prisma.member.create({
		data: {
			tenantId: tenant.id,
			firstName: "Alice",
			lastName: "Tester",
			createdBy: "u",
		},
		select: { id: true },
	});
	const campaign = await prisma.campaign.create({
		data: { tenantId: tenant.id, title: "Building Fund", createdBy: "u" },
		select: { id: true },
	});
	return { tenantId: tenant.id, memberId: member.id, campaignId: campaign.id };
}

async function seedPledge(
	tenantId: string,
	campaignId: string,
	memberId: string,
	pledgedAmount: number,
) {
	return prisma.pledge.create({
		data: {
			tenantId,
			campaignId,
			memberId,
			pledgedAmount: pledgedAmount.toFixed(2),
			createdBy: "u",
		},
		select: { id: true, status: true, paidAmount: true },
	});
}

describe("Pledge.paidAmount — atomic adjust", () => {
	it("increments paidAmount", async () => {
		const { tenantId, campaignId, memberId } = await seedFixtures();
		const pledge = await seedPledge(tenantId, campaignId, memberId, 1000);

		await repo.adjustPaidAmount(tenantId, pledge.id, 250);

		const row = await prisma.pledge.findUniqueOrThrow({
			where: { id: pledge.id },
		});
		expect(Number(row.paidAmount)).toBe(250);
		expect(row.status).toBe("ACTIVE");
	});

	it("accumulates across multiple adjusts", async () => {
		const { tenantId, campaignId, memberId } = await seedFixtures();
		const pledge = await seedPledge(tenantId, campaignId, memberId, 1000);

		await repo.adjustPaidAmount(tenantId, pledge.id, 200);
		await repo.adjustPaidAmount(tenantId, pledge.id, 300);
		await repo.adjustPaidAmount(tenantId, pledge.id, 100);

		const row = await prisma.pledge.findUniqueOrThrow({
			where: { id: pledge.id },
		});
		expect(Number(row.paidAmount)).toBe(600);
	});

	it("decrements paidAmount on negative delta", async () => {
		const { tenantId, campaignId, memberId } = await seedFixtures();
		const pledge = await seedPledge(tenantId, campaignId, memberId, 1000);
		await repo.adjustPaidAmount(tenantId, pledge.id, 500);

		await repo.adjustPaidAmount(tenantId, pledge.id, -200);

		const row = await prisma.pledge.findUniqueOrThrow({
			where: { id: pledge.id },
		});
		expect(Number(row.paidAmount)).toBe(300);
	});

	it("is a no-op when delta is 0", async () => {
		const { tenantId, campaignId, memberId } = await seedFixtures();
		const pledge = await seedPledge(tenantId, campaignId, memberId, 1000);
		await repo.adjustPaidAmount(tenantId, pledge.id, 400);

		await repo.adjustPaidAmount(tenantId, pledge.id, 0);

		const row = await prisma.pledge.findUniqueOrThrow({
			where: { id: pledge.id },
		});
		expect(Number(row.paidAmount)).toBe(400);
		expect(row.status).toBe("ACTIVE");
	});
});

describe("Pledge.paidAmount — auto-transition status", () => {
	it("flips ACTIVE → FULFILLED when paid reaches pledged", async () => {
		const { tenantId, campaignId, memberId } = await seedFixtures();
		const pledge = await seedPledge(tenantId, campaignId, memberId, 1000);

		await repo.adjustPaidAmount(tenantId, pledge.id, 1000);

		const row = await prisma.pledge.findUniqueOrThrow({
			where: { id: pledge.id },
		});
		expect(row.status).toBe("FULFILLED");
		expect(Number(row.paidAmount)).toBe(1000);
	});

	it("flips ACTIVE → FULFILLED when paid exceeds pledged (overpayment)", async () => {
		const { tenantId, campaignId, memberId } = await seedFixtures();
		const pledge = await seedPledge(tenantId, campaignId, memberId, 1000);

		await repo.adjustPaidAmount(tenantId, pledge.id, 1200);

		const row = await prisma.pledge.findUniqueOrThrow({
			where: { id: pledge.id },
		});
		expect(row.status).toBe("FULFILLED");
	});

	it("flips FULFILLED → ACTIVE when paid drops below pledged (void)", async () => {
		const { tenantId, campaignId, memberId } = await seedFixtures();
		const pledge = await seedPledge(tenantId, campaignId, memberId, 1000);

		await repo.adjustPaidAmount(tenantId, pledge.id, 1000);
		await repo.adjustPaidAmount(tenantId, pledge.id, -100);

		const row = await prisma.pledge.findUniqueOrThrow({
			where: { id: pledge.id },
		});
		expect(row.status).toBe("ACTIVE");
		expect(Number(row.paidAmount)).toBe(900);
	});

	it("does not change a CANCELLED pledge regardless of delta", async () => {
		const { tenantId, campaignId, memberId } = await seedFixtures();
		const pledge = await seedPledge(tenantId, campaignId, memberId, 1000);
		await prisma.pledge.update({
			where: { id: pledge.id },
			data: { status: "CANCELLED" },
		});

		await repo.adjustPaidAmount(tenantId, pledge.id, 1500);

		const row = await prisma.pledge.findUniqueOrThrow({
			where: { id: pledge.id },
		});
		expect(row.status).toBe("CANCELLED");
		expect(Number(row.paidAmount)).toBe(1500);
	});

	it("stays ACTIVE when delta does not cross the threshold", async () => {
		const { tenantId, campaignId, memberId } = await seedFixtures();
		const pledge = await seedPledge(tenantId, campaignId, memberId, 1000);

		await repo.adjustPaidAmount(tenantId, pledge.id, 500);

		const row = await prisma.pledge.findUniqueOrThrow({
			where: { id: pledge.id },
		});
		expect(row.status).toBe("ACTIVE");
	});

	it("stays FULFILLED when delta keeps paid above pledged", async () => {
		const { tenantId, campaignId, memberId } = await seedFixtures();
		const pledge = await seedPledge(tenantId, campaignId, memberId, 1000);
		await repo.adjustPaidAmount(tenantId, pledge.id, 1500);
		// Reduce by 200, paid still 1300 > pledged 1000.

		await repo.adjustPaidAmount(tenantId, pledge.id, -200);

		const row = await prisma.pledge.findUniqueOrThrow({
			where: { id: pledge.id },
		});
		expect(row.status).toBe("FULFILLED");
		expect(Number(row.paidAmount)).toBe(1300);
	});
});
