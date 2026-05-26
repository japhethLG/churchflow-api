import type { PrismaClientService } from "@infrastructure/prisma-client/prisma-client.service";
import { PledgeRepository } from "@modules/core/pledge/repository/pledge.repository";
import dayjs from "@shared/dayjs";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { makeTestClient, truncateAll } from "../helpers/db";

/**
 * Reproduces the user's reported scenario: a past-due ACTIVE pledge that
 * shows on the pledges list but not on the dashboard's urgent card.
 */

const prisma: PrismaClientService = makeTestClient();
const repo = new PledgeRepository(prisma);

afterAll(async () => {
	await prisma.$disconnect();
});

beforeEach(async () => {
	await truncateAll(prisma);
});

async function seedTenant() {
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
	return { tenantId: tenant.id, memberId: member.id };
}

describe("findUrgent — past-due scenarios", () => {
	it("returns an ACTIVE pledge with no campaignItem when campaign.deadline is past", async () => {
		const { tenantId, memberId } = await seedTenant();
		const yesterday = dayjs.utc().subtract(1, "day").toDate();
		const campaign = await prisma.campaign.create({
			data: {
				tenantId,
				title: "Test Campaign",
				deadline: yesterday,
				createdBy: "u",
			},
			select: { id: true },
		});
		const pledge = await prisma.pledge.create({
			data: {
				tenantId,
				campaignId: campaign.id,
				memberId,
				pledgedAmount: "100",
				createdBy: "u",
			},
			select: { id: true },
		});

		const result = await repo.findUrgent(tenantId, { limit: 8 });
		expect(result.map((p) => p.id)).toContain(pledge.id);
		const r = result.find((p) => p.id === pledge.id);
		expect(r?.lifecycle).toBe("past-due");
	});

	it("returns an ACTIVE pledge with a campaignItem deadline in the past", async () => {
		const { tenantId, memberId } = await seedTenant();
		const yesterday = dayjs.utc().subtract(1, "day").toDate();
		const farFuture = dayjs.utc().add(2, "year").toDate();
		const campaign = await prisma.campaign.create({
			data: {
				tenantId,
				title: "Building Fund",
				deadline: farFuture,
				createdBy: "u",
			},
			select: { id: true },
		});
		const item = await prisma.campaignItem.create({
			data: {
				tenantId,
				campaignId: campaign.id,
				title: "Roofing",
				targetAmount: "1000",
				deadline: yesterday,
			},
			select: { id: true },
		});
		const pledge = await prisma.pledge.create({
			data: {
				tenantId,
				campaignId: campaign.id,
				campaignItemId: item.id,
				memberId,
				pledgedAmount: "500",
				createdBy: "u",
			},
			select: { id: true },
		});

		const result = await repo.findUrgent(tenantId, { limit: 8 });
		expect(result.map((p) => p.id)).toContain(pledge.id);
	});

	it("excludes a FULFILLED pledge even if past-due", async () => {
		const { tenantId, memberId } = await seedTenant();
		const yesterday = dayjs.utc().subtract(1, "day").toDate();
		const campaign = await prisma.campaign.create({
			data: {
				tenantId,
				title: "Test Campaign",
				deadline: yesterday,
				createdBy: "u",
			},
			select: { id: true },
		});
		const pledge = await prisma.pledge.create({
			data: {
				tenantId,
				campaignId: campaign.id,
				memberId,
				pledgedAmount: "100",
				paidAmount: "100",
				status: "FULFILLED",
				createdBy: "u",
			},
			select: { id: true },
		});

		const result = await repo.findUrgent(tenantId, { limit: 8 });
		expect(result.map((p) => p.id)).not.toContain(pledge.id);
	});

	it("excludes an ACTIVE pledge that's already fully paid (data drift)", async () => {
		// Defensive: if status is somehow ACTIVE but paid >= pledged
		// (because auto-transition didn't fire), the paidAmount < pledged
		// SQL filter should still exclude it.
		const { tenantId, memberId } = await seedTenant();
		const yesterday = dayjs.utc().subtract(1, "day").toDate();
		const campaign = await prisma.campaign.create({
			data: {
				tenantId,
				title: "Test Campaign",
				deadline: yesterday,
				createdBy: "u",
			},
			select: { id: true },
		});
		const pledge = await prisma.pledge.create({
			data: {
				tenantId,
				campaignId: campaign.id,
				memberId,
				pledgedAmount: "100",
				paidAmount: "100",
				status: "ACTIVE",
				createdBy: "u",
			},
			select: { id: true },
		});

		const result = await repo.findUrgent(tenantId, { limit: 8 });
		expect(result.map((p) => p.id)).not.toContain(pledge.id);
	});
});
