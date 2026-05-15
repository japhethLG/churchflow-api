import type { PrismaClientService } from "@infrastructure/prisma-client/prisma-client.service";
import {
	restore,
	softDelete,
	withDeleted,
} from "@infrastructure/prisma-client/soft-delete";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { makeTestClient, truncateAll } from "../helpers/db";

/**
 * Integration tests for the soft-delete extension + helpers.
 *
 * Each test runs against a real Postgres container (started by
 * [global-setup.ts](../setup/global-setup.ts)) with all tables truncated
 * beforehand. Production code paths (extension, proxy, helpers) are
 * exercised end-to-end — no mocks.
 */

const prisma: PrismaClientService = makeTestClient();

afterAll(async () => {
	await prisma.$disconnect();
});

beforeEach(async () => {
	await truncateAll(prisma);
});

interface TenantRow {
	id: string;
	slug: string;
}

interface MemberRow {
	id: string;
}

interface CampaignRow {
	id: string;
}

interface CampaignItemRow {
	id: string;
}

async function seedTenant(slug = "first-baptist"): Promise<TenantRow> {
	return prisma.tenant.create({
		data: {
			slug,
			name: `Test Tenant ${slug}`,
			createdBy: "test-user",
		},
		select: { id: true, slug: true },
	});
}

async function seedMember(
	tenantId: string,
	name = "Alice",
): Promise<MemberRow> {
	return prisma.member.create({
		data: {
			tenantId,
			firstName: name,
			lastName: "Tester",
			createdBy: "test-user",
		},
		select: { id: true },
	});
}

async function seedCampaign(
	tenantId: string,
	title = "Building Fund",
): Promise<CampaignRow> {
	return prisma.campaign.create({
		data: {
			tenantId,
			title,
			createdBy: "test-user",
		},
		select: { id: true },
	});
}

async function seedItem(
	tenantId: string,
	campaignId: string,
	title: string,
): Promise<CampaignItemRow> {
	return prisma.campaignItem.create({
		data: {
			tenantId,
			campaignId,
			title,
			targetAmount: "100.00",
		},
		select: { id: true },
	});
}

async function seedUser(
	firebaseUid: string,
	email = `${firebaseUid}@test.local`,
): Promise<{ id: string }> {
	return prisma.user.create({
		data: { firebaseUid, email, displayName: firebaseUid },
		select: { id: true },
	});
}

describe("Soft-delete extension — read auto-filter", () => {
	it("findMany excludes soft-deleted rows by default", async () => {
		const tenant = await seedTenant();
		const active = await seedMember(tenant.id, "Active");
		const archived = await seedMember(tenant.id, "Archived");

		await softDelete(prisma, "Member", {
			where: { id: archived.id },
			actorId: "admin-1",
		});

		const visible = await prisma.member.findMany({
			where: { tenantId: tenant.id },
		});
		expect(visible.map((m) => m.id)).toEqual([active.id]);
	});

	it("findFirst returns null when the only match is soft-deleted", async () => {
		const tenant = await seedTenant();
		const member = await seedMember(tenant.id);
		await softDelete(prisma, "Member", {
			where: { id: member.id },
			actorId: "admin-1",
		});

		const result = await prisma.member.findFirst({
			where: { id: member.id },
		});
		expect(result).toBeNull();
	});

	it("findUnique returns null for a soft-deleted row", async () => {
		const tenant = await seedTenant();
		const member = await seedMember(tenant.id);
		await softDelete(prisma, "Member", {
			where: { id: member.id },
			actorId: "admin-1",
		});

		const result = await prisma.member.findUnique({
			where: { id: member.id },
		});
		expect(result).toBeNull();
	});

	it("findUnique with a custom select does NOT fail open", async () => {
		// The headline `findUnique` + `select` fail-open bug from the Griffin
		// extension. Caller asks for a projection that omits `deletedAt`; the
		// extension must still detect the tombstone.
		const tenant = await seedTenant();
		const member = await seedMember(tenant.id);
		await softDelete(prisma, "Member", {
			where: { id: member.id },
			actorId: "admin-1",
		});

		const result = await prisma.member.findUnique({
			where: { id: member.id },
			select: { id: true, firstName: true },
		});
		expect(result).toBeNull();
	});

	it("findUnique with a custom select strips deletedAt from the response", async () => {
		const tenant = await seedTenant();
		const member = await seedMember(tenant.id);

		const result = await prisma.member.findUnique({
			where: { id: member.id },
			select: { id: true, firstName: true },
		});
		expect(result).not.toBeNull();
		expect(result).toEqual({ id: member.id, firstName: "Alice" });
		expect(result).not.toHaveProperty("deletedAt");
	});

	it("count excludes soft-deleted rows", async () => {
		const tenant = await seedTenant();
		await seedMember(tenant.id, "One");
		const two = await seedMember(tenant.id, "Two");
		await softDelete(prisma, "Member", {
			where: { id: two.id },
			actorId: "admin-1",
		});

		const count = await prisma.member.count({ where: { tenantId: tenant.id } });
		expect(count).toBe(1);
	});
});

describe("Soft-delete extension — escape hatch", () => {
	it("explicit deletedAt filter bypasses the auto-filter", async () => {
		const tenant = await seedTenant();
		const active = await seedMember(tenant.id, "Active");
		const archived = await seedMember(tenant.id, "Archived");
		await softDelete(prisma, "Member", {
			where: { id: archived.id },
			actorId: "admin-1",
		});

		const all = await prisma.member.findMany({
			where: { tenantId: tenant.id, deletedAt: undefined } as never,
		});
		expect(all.map((m) => m.id).sort()).toEqual(
			[active.id, archived.id].sort(),
		);
	});

	it("filtering for only-deleted rows works via explicit deletedAt", async () => {
		const tenant = await seedTenant();
		await seedMember(tenant.id, "Active");
		const archived = await seedMember(tenant.id, "Archived");
		await softDelete(prisma, "Member", {
			where: { id: archived.id },
			actorId: "admin-1",
		});

		const deletedOnly = await prisma.member.findMany({
			where: { tenantId: tenant.id, deletedAt: { not: null } },
		});
		expect(deletedOnly.map((m) => m.id)).toEqual([archived.id]);
	});
});

describe("Soft-delete extension — write block", () => {
	it("updateMany cannot modify a tombstone via the default filter", async () => {
		const tenant = await seedTenant();
		const member = await seedMember(tenant.id);
		await softDelete(prisma, "Member", {
			where: { id: member.id },
			actorId: "admin-1",
		});

		const result = await prisma.member.updateMany({
			where: { id: member.id },
			data: { firstName: "Should Not Apply" },
		});
		expect(result.count).toBe(0);

		// Read with explicit escape hatch to confirm the row is unchanged.
		const row = await prisma.member.findFirst({
			where: { id: member.id, deletedAt: { not: null } },
		});
		expect(row?.firstName).toBe("Alice");
	});

	it("update on a tombstone throws P2025 (no matching row)", async () => {
		const tenant = await seedTenant();
		const member = await seedMember(tenant.id);
		await softDelete(prisma, "Member", {
			where: { id: member.id },
			actorId: "admin-1",
		});

		await expect(
			prisma.member.update({
				where: { id: member.id },
				data: { firstName: "Should Not Apply" },
			}),
		).rejects.toMatchObject({ code: "P2025" });
	});

	it("delete cannot hard-delete a tombstone via the default filter", async () => {
		const tenant = await seedTenant();
		const member = await seedMember(tenant.id);
		await softDelete(prisma, "Member", {
			where: { id: member.id },
			actorId: "admin-1",
		});

		await expect(
			prisma.member.delete({ where: { id: member.id } }),
		).rejects.toMatchObject({ code: "P2025" });

		// Tombstone still exists.
		const row = await prisma.member.findFirst({
			where: { id: member.id, deletedAt: { not: null } },
		});
		expect(row).not.toBeNull();
	});

	it("deleteMany skips tombstones by default", async () => {
		const tenant = await seedTenant();
		const active = await seedMember(tenant.id, "Active");
		const archived = await seedMember(tenant.id, "Archived");
		await softDelete(prisma, "Member", {
			where: { id: archived.id },
			actorId: "admin-1",
		});

		const result = await prisma.member.deleteMany({
			where: { tenantId: tenant.id },
		});
		expect(result.count).toBe(1);

		// Active row is gone; tombstone survives.
		const remaining = await prisma.member.findMany({
			where: { tenantId: tenant.id, deletedAt: undefined } as never,
		});
		expect(remaining.map((m) => m.id)).toEqual([archived.id]);
		expect(remaining[0]?.id).not.toBe(active.id);
	});

	it("delete with explicit escape hatch can purge a tombstone", async () => {
		const tenant = await seedTenant();
		const member = await seedMember(tenant.id);
		await softDelete(prisma, "Member", {
			where: { id: member.id },
			actorId: "admin-1",
		});

		await prisma.member.delete({
			where: { id: member.id, deletedAt: { not: null } },
		});

		const row = await prisma.member.findFirst({
			where: { id: member.id, deletedAt: undefined } as never,
		});
		expect(row).toBeNull();
	});
});

describe("Soft-delete extension — upsert", () => {
	it("upserts a new row when no record matches", async () => {
		const tenant = await seedTenant();
		const user = await seedUser("uid-new");

		const upserted = await prisma.member.upsert({
			where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
			create: {
				tenantId: tenant.id,
				userId: user.id,
				firstName: "Brand",
				lastName: "New",
				createdBy: "admin-1",
			},
			update: { firstName: "Should Not Hit" },
		});

		expect(upserted.firstName).toBe("Brand");
		expect(upserted.deletedAt).toBeNull();
	});

	it("upserts (update branch) when an active row matches", async () => {
		const tenant = await seedTenant();
		const user = await seedUser("uid-existing");
		await prisma.member.create({
			data: {
				tenantId: tenant.id,
				userId: user.id,
				firstName: "Original",
				lastName: "Person",
				createdBy: "admin-1",
			},
		});

		const upserted = await prisma.member.upsert({
			where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
			create: {
				tenantId: tenant.id,
				userId: user.id,
				firstName: "Should Not Hit",
				lastName: "Person",
				createdBy: "admin-1",
			},
			update: { firstName: "Updated" },
		});

		expect(upserted.firstName).toBe("Updated");
	});

	it("upsert against a slot held by a tombstone creates a NEW active row, leaving the tombstone intact", async () => {
		const tenant = await seedTenant();
		const user = await seedUser("uid-archived");
		const member = await prisma.member.create({
			data: {
				tenantId: tenant.id,
				userId: user.id,
				firstName: "Archived",
				lastName: "Person",
				createdBy: "admin-1",
			},
		});

		await softDelete(prisma, "Member", {
			where: { id: member.id },
			actorId: "admin-1",
		});

		// The partial unique index on `(tenantId, userId) WHERE deletedAt IS
		// NULL` releases the slot once the row is soft-deleted, so the upsert
		// can create a fresh active row without colliding. The tombstone is
		// untouched and remains queryable via the escape hatch — its
		// historical pledges/transactions are preserved.
		//
		// Callers that want "restore the archived member instead of creating
		// a new one" must call `restore` explicitly; upsert intentionally
		// gives a fresh start.
		const upserted = await prisma.member.upsert({
			where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
			create: {
				tenantId: tenant.id,
				userId: user.id,
				firstName: "Fresh",
				lastName: "Person",
				createdBy: "admin-1",
			},
			update: { firstName: "Should Not Hit" },
		});

		expect(upserted.firstName).toBe("Fresh");
		expect(upserted.id).not.toBe(member.id);
		expect(upserted.deletedAt).toBeNull();

		// Tombstone still there, untouched.
		const tombstone = await prisma.member.findFirst({
			where: { id: member.id, deletedAt: { not: null } },
		});
		expect(tombstone?.firstName).toBe("Archived");
		expect(tombstone?.deletedAt).toBeInstanceOf(Date);
	});
});

describe("Soft-delete helper — softDelete (no cascade)", () => {
	it("stamps deletedAt + deletedBy and leaves deletedByCascade false", async () => {
		const tenant = await seedTenant();
		const member = await seedMember(tenant.id);

		const result = await softDelete(prisma, "Member", {
			where: { id: member.id },
			actorId: "admin-1",
		});

		expect(result.ids).toEqual([member.id]);

		const row = await prisma.member.findFirst({
			where: { id: member.id, deletedAt: { not: null } },
		});
		expect(row?.deletedAt).toBeInstanceOf(Date);
		expect(row?.deletedBy).toBe("admin-1");
		expect(row?.deletedByCascade).toBe(false);
	});

	it("returns empty ids when nothing matches", async () => {
		const tenant = await seedTenant();
		const result = await softDelete(prisma, "Member", {
			where: {
				id: "00000000-0000-0000-0000-000000000000",
				tenantId: tenant.id,
			},
			actorId: "admin-1",
		});
		expect(result.ids).toEqual([]);
	});

	it("does NOT cascade across association relations (Member → Transaction)", async () => {
		// The critical traceability property: archiving a member must leave
		// their transactions intact.
		const tenant = await seedTenant();
		const member = await seedMember(tenant.id);

		const tx = await prisma.transaction.create({
			data: {
				tenantId: tenant.id,
				memberId: member.id,
				type: "TITHE",
				amount: "50.00",
				date: new Date(),
				createdBy: "admin-1",
			},
			select: { id: true },
		});

		await softDelete(prisma, "Member", {
			where: { id: member.id },
			actorId: "admin-1",
		});

		const txRow = await prisma.transaction.findUnique({ where: { id: tx.id } });
		expect(txRow).not.toBeNull();
		expect(txRow?.deletedAt).toBeNull();
	});
});

describe("Soft-delete helper — softDelete with cascade", () => {
	it("cascades into composition children (Campaign → CampaignItem)", async () => {
		const tenant = await seedTenant();
		const campaign = await seedCampaign(tenant.id);
		const itemA = await seedItem(tenant.id, campaign.id, "Roofing");
		const itemB = await seedItem(tenant.id, campaign.id, "Gates");

		await softDelete(prisma, "Campaign", {
			where: { id: campaign.id },
			actorId: "admin-1",
		});

		const items = await prisma.campaignItem.findMany({
			where: {
				id: { in: [itemA.id, itemB.id] },
				deletedAt: { not: null },
			},
		});
		expect(items).toHaveLength(2);
		for (const item of items) {
			expect(item.deletedByCascade).toBe(true);
			expect(item.deletedBy).toBe("admin-1");
		}
	});

	it("does NOT cascade into association children (Campaign → Pledge)", async () => {
		const tenant = await seedTenant();
		const campaign = await seedCampaign(tenant.id);
		const member = await seedMember(tenant.id);

		const pledge = await prisma.pledge.create({
			data: {
				tenantId: tenant.id,
				campaignId: campaign.id,
				memberId: member.id,
				pledgedAmount: "100.00",
				createdBy: "admin-1",
			},
			select: { id: true },
		});

		await softDelete(prisma, "Campaign", {
			where: { id: campaign.id },
			actorId: "admin-1",
		});

		const pledgeRow = await prisma.pledge.findUnique({
			where: { id: pledge.id },
		});
		expect(pledgeRow).not.toBeNull();
		expect(pledgeRow?.deletedAt).toBeNull();
	});
});

describe("Soft-delete helper — restore", () => {
	it("restores a soft-deleted row and cascades to children with deletedByCascade=true", async () => {
		const tenant = await seedTenant();
		const campaign = await seedCampaign(tenant.id);
		const item = await seedItem(tenant.id, campaign.id, "Roofing");

		await softDelete(prisma, "Campaign", {
			where: { id: campaign.id },
			actorId: "admin-1",
		});

		const restored = await restore(prisma, "Campaign", {
			where: { id: campaign.id },
		});
		expect(restored.ids).toEqual([campaign.id]);

		const camp = await prisma.campaign.findUnique({
			where: { id: campaign.id },
		});
		expect(camp?.deletedAt).toBeNull();

		const itemRow = await prisma.campaignItem.findUnique({
			where: { id: item.id },
		});
		expect(itemRow).not.toBeNull();
		expect(itemRow?.deletedAt).toBeNull();
		expect(itemRow?.deletedByCascade).toBe(false);
	});

	it("preserves independently-deleted descendants — does NOT resurrect them", async () => {
		// The exact restore-symmetry property the deletedByCascade flag exists
		// to protect. Item A is deleted intentionally first; then the campaign
		// is archived (cascade-deletes B); then the campaign is restored.
		// A must stay deleted. B must come back.
		const tenant = await seedTenant();
		const campaign = await seedCampaign(tenant.id);
		const itemA = await seedItem(tenant.id, campaign.id, "Removed-A");
		const itemB = await seedItem(tenant.id, campaign.id, "Cascaded-B");

		await softDelete(prisma, "CampaignItem", {
			where: { id: itemA.id },
			actorId: "admin-1",
		});

		await softDelete(prisma, "Campaign", {
			where: { id: campaign.id },
			actorId: "admin-1",
		});

		await restore(prisma, "Campaign", { where: { id: campaign.id } });

		const aRow = await prisma.campaignItem.findFirst({
			where: { id: itemA.id, deletedAt: { not: null } },
		});
		expect(aRow).not.toBeNull();
		expect(aRow?.deletedByCascade).toBe(false);

		const bRow = await prisma.campaignItem.findUnique({
			where: { id: itemB.id },
		});
		expect(bRow).not.toBeNull();
		expect(bRow?.deletedAt).toBeNull();
	});
});

describe("Soft-delete extension — pass-through for non-soft-deletable models", () => {
	it("AuditEvent reads are unfiltered (no deletedAt column)", async () => {
		const tenant = await seedTenant();
		await prisma.auditEvent.create({
			data: {
				tenantId: tenant.id,
				actorUid: "uid-1",
				action: "CREATE",
				entity: "Tenant",
				entityId: tenant.id,
			},
		});

		const events = await prisma.auditEvent.findMany({
			where: { tenantId: tenant.id },
		});
		expect(events).toHaveLength(1);
	});
});

describe("Soft-delete extension — relation defaults", () => {
	it("optional to-one: archived parent → field is null by default", async () => {
		// Industry-standard default. Transaction.member is optional to-one;
		// when the member is archived, `joined.member` is null and the caller
		// must explicitly opt back in via withDeleted or a deletedAt filter.
		const tenant = await seedTenant();
		const member = await seedMember(tenant.id, "Departed");

		const tx = await prisma.transaction.create({
			data: {
				tenantId: tenant.id,
				memberId: member.id,
				type: "TITHE",
				amount: "75.00",
				date: new Date(),
				createdBy: "admin-1",
			},
			select: { id: true },
		});

		await softDelete(prisma, "Member", {
			where: { id: member.id },
			actorId: "admin-1",
		});

		const joined = await prisma.transaction.findUnique({
			where: { id: tx.id },
			include: { member: true },
		});

		expect(joined).not.toBeNull();
		expect(joined?.member).toBeNull();
	});

	it("optional to-one: withDeleted surfaces the tombstone", async () => {
		const tenant = await seedTenant();
		const member = await seedMember(tenant.id, "Departed");

		const tx = await prisma.transaction.create({
			data: {
				tenantId: tenant.id,
				memberId: member.id,
				type: "TITHE",
				amount: "75.00",
				date: new Date(),
				createdBy: "admin-1",
			},
			select: { id: true },
		});

		await softDelete(prisma, "Member", {
			where: { id: member.id },
			actorId: "admin-1",
		});

		const joined = await prisma.transaction.findUnique(
			withDeleted("Transaction", {
				where: { id: tx.id },
				include: { member: true },
			}),
		);

		expect(joined?.member).not.toBeNull();
		expect(joined?.member?.id).toBe(member.id);
		expect(joined?.member?.firstName).toBe("Departed");
		expect(joined?.member?.deletedAt).toBeInstanceOf(Date);
	});

	it("required to-one: tombstone always surfaces (Prisma type constraint)", async () => {
		// Pledge.campaign is REQUIRED to-one — Prisma's CampaignDefaultArgs
		// type has no `where` field, so the extension cannot honestly filter
		// it. The tombstone surfaces; callers inspect deletedAt on the result.
		const tenant = await seedTenant();
		const member = await seedMember(tenant.id);
		const campaign = await seedCampaign(tenant.id);

		const pledge = await prisma.pledge.create({
			data: {
				tenantId: tenant.id,
				campaignId: campaign.id,
				memberId: member.id,
				pledgedAmount: "100.00",
				createdBy: "admin-1",
			},
			select: { id: true },
		});

		await softDelete(prisma, "Campaign", {
			where: { id: campaign.id },
			actorId: "admin-1",
		});

		const joined = await prisma.pledge.findUnique({
			where: { id: pledge.id },
			include: { campaign: true },
		});

		expect(joined?.campaign).not.toBeNull();
		expect(joined?.campaign?.deletedAt).toBeInstanceOf(Date);
	});

	it("to-many: archived children are excluded by default", async () => {
		const tenant = await seedTenant();
		const campaign = await seedCampaign(tenant.id);
		const itemActive = await seedItem(tenant.id, campaign.id, "Active");
		const itemArchived = await seedItem(tenant.id, campaign.id, "Archived");

		await softDelete(prisma, "CampaignItem", {
			where: { id: itemArchived.id },
			actorId: "admin-1",
		});

		const campWith = await prisma.campaign.findUnique({
			where: { id: campaign.id },
			include: { items: true },
		});
		expect(campWith?.items.map((i) => i.id)).toEqual([itemActive.id]);
	});

	it("to-many: withDeleted surfaces archived children", async () => {
		const tenant = await seedTenant();
		const campaign = await seedCampaign(tenant.id);
		const itemActive = await seedItem(tenant.id, campaign.id, "Active");
		const itemArchived = await seedItem(tenant.id, campaign.id, "Archived");

		await softDelete(prisma, "CampaignItem", {
			where: { id: itemArchived.id },
			actorId: "admin-1",
		});

		const campWith = await prisma.campaign.findUnique(
			withDeleted("Campaign", {
				where: { id: campaign.id },
				include: { items: true },
			}),
		);
		expect(campWith?.items.map((i) => i.id).sort()).toEqual(
			[itemActive.id, itemArchived.id].sort(),
		);
	});

	it("relation predicates in `where`: tombstoned related rows don't match", async () => {
		const tenant = await seedTenant();
		const activeJohn = await seedMember(tenant.id, "John");
		const archivedJohn = await seedMember(tenant.id, "John");

		await prisma.transaction.create({
			data: {
				tenantId: tenant.id,
				memberId: activeJohn.id,
				type: "TITHE",
				amount: "10.00",
				date: new Date(),
				createdBy: "admin-1",
			},
		});
		await prisma.transaction.create({
			data: {
				tenantId: tenant.id,
				memberId: archivedJohn.id,
				type: "TITHE",
				amount: "20.00",
				date: new Date(),
				createdBy: "admin-1",
			},
		});

		await softDelete(prisma, "Member", {
			where: { id: archivedJohn.id },
			actorId: "admin-1",
		});

		const txs = await prisma.transaction.findMany({
			where: {
				tenantId: tenant.id,
				member: { firstName: "John" },
			},
		});

		// Only the transaction whose member is still active matches.
		expect(txs).toHaveLength(1);
		expect(txs[0]?.memberId).toBe(activeJohn.id);
	});

	it("withDeleted propagates through nested includes", async () => {
		const tenant = await seedTenant();
		const member = await seedMember(tenant.id);
		const campaign = await seedCampaign(tenant.id);

		const pledge = await prisma.pledge.create({
			data: {
				tenantId: tenant.id,
				campaignId: campaign.id,
				memberId: member.id,
				pledgedAmount: "100.00",
				createdBy: "admin-1",
			},
			select: { id: true },
		});

		await softDelete(prisma, "Pledge", {
			where: { id: pledge.id },
			actorId: "admin-1",
		});
		await softDelete(prisma, "Member", {
			where: { id: member.id },
			actorId: "admin-1",
		});

		// Without withDeleted, neither the tombstoned pledge nor its member
		// would be visible. With withDeleted, both come back.
		const camp = await prisma.campaign.findUnique(
			withDeleted("Campaign", {
				where: { id: campaign.id },
				include: { pledges: { include: { member: true } } },
			}),
		);

		expect(camp?.pledges).toHaveLength(1);
		expect(camp?.pledges[0]?.id).toBe(pledge.id);
		expect(camp?.pledges[0]?.deletedAt).toBeInstanceOf(Date);
		expect(camp?.pledges[0]?.member).not.toBeNull();
		expect(camp?.pledges[0]?.member?.deletedAt).toBeInstanceOf(Date);
	});

	it("nested filtering through `select` (not just include) filters relations", async () => {
		const tenant = await seedTenant();
		const member = await seedMember(tenant.id, "Departed");
		const tx = await prisma.transaction.create({
			data: {
				tenantId: tenant.id,
				memberId: member.id,
				type: "TITHE",
				amount: "10.00",
				date: new Date(),
				createdBy: "admin-1",
			},
			select: { id: true },
		});

		await softDelete(prisma, "Member", {
			where: { id: member.id },
			actorId: "admin-1",
		});

		const result = await prisma.transaction.findUnique({
			where: { id: tx.id },
			select: {
				id: true,
				member: { select: { firstName: true } },
			},
		});
		expect(result).not.toBeNull();
		expect(result?.member).toBeNull();
	});

	it("relation predicates inside AND/OR/NOT filter correctly", async () => {
		const tenant = await seedTenant();
		const activeAlice = await seedMember(tenant.id, "Alice");
		const activeBob = await seedMember(tenant.id, "Bob");
		const archivedAlice = await seedMember(tenant.id, "Alice");

		await prisma.transaction.create({
			data: {
				tenantId: tenant.id,
				memberId: activeAlice.id,
				type: "TITHE",
				amount: "1.00",
				date: new Date(),
				createdBy: "admin-1",
			},
		});
		await prisma.transaction.create({
			data: {
				tenantId: tenant.id,
				memberId: activeBob.id,
				type: "TITHE",
				amount: "2.00",
				date: new Date(),
				createdBy: "admin-1",
			},
		});
		await prisma.transaction.create({
			data: {
				tenantId: tenant.id,
				memberId: archivedAlice.id,
				type: "TITHE",
				amount: "3.00",
				date: new Date(),
				createdBy: "admin-1",
			},
		});

		await softDelete(prisma, "Member", {
			where: { id: archivedAlice.id },
			actorId: "admin-1",
		});

		// OR with relation predicates: each predicate's member must be active.
		const txs = await prisma.transaction.findMany({
			where: {
				tenantId: tenant.id,
				OR: [
					{ member: { firstName: "Alice" } },
					{ member: { firstName: "Bob" } },
				],
			},
			orderBy: { amount: "asc" },
		});
		expect(txs.map((t) => t.memberId)).toEqual([activeAlice.id, activeBob.id]);
	});

	it("withDeleted is idempotent — calling it twice produces the same result", async () => {
		const tenant = await seedTenant();
		const member = await seedMember(tenant.id, "Departed");
		await softDelete(prisma, "Member", {
			where: { id: member.id },
			actorId: "admin-1",
		});

		const once = await prisma.member.findMany(
			withDeleted("Member", {
				where: { tenantId: tenant.id },
			}),
		);
		const twice = await prisma.member.findMany(
			withDeleted(
				"Member",
				withDeleted("Member", { where: { tenantId: tenant.id } }),
			),
		);

		expect(once.map((m) => m.id).sort()).toEqual(twice.map((m) => m.id).sort());
		expect(once).toHaveLength(1);
	});

	it("withDeleted on a non-soft-deletable target is a no-op for that target", async () => {
		// AuditEvent has no deletedAt — including it under withDeleted should
		// neither error nor change the result shape.
		const tenant = await seedTenant();
		await prisma.auditEvent.create({
			data: {
				tenantId: tenant.id,
				actorUid: "uid-1",
				action: "CREATE",
				entity: "Tenant",
				entityId: tenant.id,
			},
		});

		const events = await prisma.auditEvent.findMany(
			withDeleted("AuditEvent", { where: { tenantId: tenant.id } }),
		);
		expect(events).toHaveLength(1);
	});

	it("withDeleted throws on an unknown model name (typo protection)", () => {
		expect(() => withDeleted("Memer", { where: {} })).toThrow(
			/unknown model "Memer"/,
		);
	});

	it("_count: true shorthand also respects the default-filter", async () => {
		// The boolean shorthand was a footgun if it bypassed the filter while
		// the object form filtered. The walker expands `_count: true` so
		// every relation count gets `where: { deletedAt: null }` applied.
		const tenant = await seedTenant();
		const campaign = await seedCampaign(tenant.id);
		await seedItem(tenant.id, campaign.id, "Active");
		const itemArchived = await seedItem(tenant.id, campaign.id, "Archived");

		await softDelete(prisma, "CampaignItem", {
			where: { id: itemArchived.id },
			actorId: "admin-1",
		});

		const camp = await prisma.campaign.findUnique({
			where: { id: campaign.id },
			include: { _count: true },
		});

		expect(camp?._count.items).toBe(1);
	});

	it("Transaction aggregates include rows whose parents have been archived", async () => {
		// Tenant totals must not drop when a member is soft-deleted. The
		// transaction's own deletedAt is what gates aggregation, never the
		// parent's.
		const tenant = await seedTenant();
		const member = await seedMember(tenant.id);

		await prisma.transaction.create({
			data: {
				tenantId: tenant.id,
				memberId: member.id,
				type: "TITHE",
				amount: "100.00",
				date: new Date(),
				createdBy: "admin-1",
			},
		});

		await softDelete(prisma, "Member", {
			where: { id: member.id },
			actorId: "admin-1",
		});

		const totals = await prisma.transaction.aggregate({
			where: { tenantId: tenant.id },
			_sum: { amount: true },
			_count: true,
		});

		expect(totals._count).toBe(1);
		expect(totals._sum.amount?.toString()).toBe("100");
	});

	it("2-level include: required to-one grandparent surfaces, even with default-filter", async () => {
		// Transaction.pledge is OPTIONAL to-one but the pledge is still
		// ACTIVE → it surfaces normally.
		// Pledge.campaign is REQUIRED to-one — Prisma's type system has no
		// `where` field on the include args, so the extension cannot filter
		// it. The campaign tombstone surfaces here by Prisma's own
		// constraint.
		const tenant = await seedTenant();
		const member = await seedMember(tenant.id);
		const campaign = await seedCampaign(tenant.id);

		const pledge = await prisma.pledge.create({
			data: {
				tenantId: tenant.id,
				campaignId: campaign.id,
				memberId: member.id,
				pledgedAmount: "100.00",
				createdBy: "admin-1",
			},
			select: { id: true },
		});

		const tx = await prisma.transaction.create({
			data: {
				tenantId: tenant.id,
				memberId: member.id,
				campaignId: campaign.id,
				pledgeId: pledge.id,
				type: "COMMITMENT",
				amount: "50.00",
				date: new Date(),
				createdBy: "admin-1",
			},
			select: { id: true },
		});

		await softDelete(prisma, "Campaign", {
			where: { id: campaign.id },
			actorId: "admin-1",
		});

		const joined = await prisma.transaction.findUnique({
			where: { id: tx.id },
			include: { pledge: { include: { campaign: true } } },
		});

		expect(joined?.pledge).not.toBeNull();
		expect(joined?.pledge?.campaign).not.toBeNull();
		expect(joined?.pledge?.campaign?.id).toBe(campaign.id);
		expect(joined?.pledge?.campaign?.deletedAt).toBeInstanceOf(Date);
	});

	it("nested select still detects an outer tombstone", async () => {
		// Outer-row tombstone detection (the findUnique select-widening fix)
		// must work even when the projection includes a related model with
		// its own nested select.
		const tenant = await seedTenant();
		const member = await seedMember(tenant.id);
		const tx = await prisma.transaction.create({
			data: {
				tenantId: tenant.id,
				memberId: member.id,
				type: "TITHE",
				amount: "75.00",
				date: new Date(),
				createdBy: "admin-1",
			},
			select: { id: true },
		});

		await softDelete(prisma, "Transaction", {
			where: { id: tx.id },
			actorId: "admin-1",
		});

		const result = await prisma.transaction.findUnique({
			where: { id: tx.id },
			select: {
				id: true,
				amount: true,
				member: { select: { firstName: true } },
			},
		});
		expect(result).toBeNull();
	});

	it("_count for a relation EXCLUDES tombstones by default", async () => {
		const tenant = await seedTenant();
		const campaign = await seedCampaign(tenant.id);
		await seedItem(tenant.id, campaign.id, "Active");
		const itemArchived = await seedItem(tenant.id, campaign.id, "Archived");

		await softDelete(prisma, "CampaignItem", {
			where: { id: itemArchived.id },
			actorId: "admin-1",
		});

		const activeCount = await prisma.campaign.findUnique({
			where: { id: campaign.id },
			include: { _count: { select: { items: true } } },
		});
		expect(activeCount?._count.items).toBe(1);
	});

	it("_count with withDeleted INCLUDES tombstones", async () => {
		const tenant = await seedTenant();
		const campaign = await seedCampaign(tenant.id);
		await seedItem(tenant.id, campaign.id, "Active");
		const itemArchived = await seedItem(tenant.id, campaign.id, "Archived");

		await softDelete(prisma, "CampaignItem", {
			where: { id: itemArchived.id },
			actorId: "admin-1",
		});

		const allCount = await prisma.campaign.findUnique(
			withDeleted("Campaign", {
				where: { id: campaign.id },
				include: { _count: { select: { items: true } } },
			}),
		);
		expect(allCount?._count.items).toBe(2);
	});
});

describe("Soft-delete extension — aggregate / groupBy", () => {
	it("aggregate excludes soft-deleted rows from sums", async () => {
		const tenant = await seedTenant();
		const member = await seedMember(tenant.id);

		await prisma.transaction.create({
			data: {
				tenantId: tenant.id,
				memberId: member.id,
				type: "TITHE",
				amount: "100.00",
				date: new Date(),
				createdBy: "admin-1",
			},
		});

		const voided = await prisma.transaction.create({
			data: {
				tenantId: tenant.id,
				memberId: member.id,
				type: "TITHE",
				amount: "999.99",
				date: new Date(),
				createdBy: "admin-1",
			},
			select: { id: true },
		});

		await softDelete(prisma, "Transaction", {
			where: { id: voided.id },
			actorId: "admin-1",
		});

		const totals = await prisma.transaction.aggregate({
			where: { tenantId: tenant.id },
			_sum: { amount: true },
			_count: true,
		});

		expect(totals._count).toBe(1);
		expect(totals._sum.amount?.toString()).toBe("100");
	});

	it("groupBy excludes soft-deleted rows", async () => {
		const tenant = await seedTenant();
		const member = await seedMember(tenant.id);

		await prisma.transaction.create({
			data: {
				tenantId: tenant.id,
				memberId: member.id,
				type: "TITHE",
				amount: "50.00",
				date: new Date(),
				createdBy: "admin-1",
			},
		});

		const voided = await prisma.transaction.create({
			data: {
				tenantId: tenant.id,
				memberId: member.id,
				type: "OFFERING",
				amount: "25.00",
				date: new Date(),
				createdBy: "admin-1",
			},
			select: { id: true },
		});

		await softDelete(prisma, "Transaction", {
			where: { id: voided.id },
			actorId: "admin-1",
		});

		const grouped = await prisma.transaction.groupBy({
			by: ["type"],
			where: { tenantId: tenant.id },
			_count: true,
		});

		expect(grouped).toHaveLength(1);
		expect(grouped[0]?.type).toBe("TITHE");
	});
});

describe("Soft-delete helper — transactional atomicity", () => {
	it("a thrown error inside $transaction rolls back the cascade", async () => {
		// `softDelete` accepts any client; calling it with a `tx` should make
		// the whole cascade atomic with whatever else the caller does in the
		// transaction.
		const tenant = await seedTenant();
		const campaign = await seedCampaign(tenant.id);
		const item = await seedItem(tenant.id, campaign.id, "Roofing");

		await expect(
			prisma.$transaction(async (tx) => {
				await softDelete(tx, "Campaign", {
					where: { id: campaign.id },
					actorId: "admin-1",
				});
				throw new Error("simulated downstream failure");
			}),
		).rejects.toThrow("simulated downstream failure");

		// Neither the campaign nor the cascaded item should have been touched.
		const campRow = await prisma.campaign.findUnique({
			where: { id: campaign.id },
		});
		expect(campRow?.deletedAt).toBeNull();

		const itemRow = await prisma.campaignItem.findUnique({
			where: { id: item.id },
		});
		expect(itemRow?.deletedAt).toBeNull();
		expect(itemRow?.deletedByCascade).toBe(false);
	});

	it("a thrown error inside $transaction rolls back a restore", async () => {
		const tenant = await seedTenant();
		const campaign = await seedCampaign(tenant.id);
		const item = await seedItem(tenant.id, campaign.id, "Roofing");

		await softDelete(prisma, "Campaign", {
			where: { id: campaign.id },
			actorId: "admin-1",
		});

		await expect(
			prisma.$transaction(async (tx) => {
				await restore(tx, "Campaign", { where: { id: campaign.id } });
				throw new Error("simulated downstream failure");
			}),
		).rejects.toThrow("simulated downstream failure");

		const campRow = await prisma.campaign.findFirst({
			where: { id: campaign.id, deletedAt: { not: null } },
		});
		expect(campRow).not.toBeNull();

		const itemRow = await prisma.campaignItem.findFirst({
			where: { id: item.id, deletedAt: { not: null } },
		});
		expect(itemRow).not.toBeNull();
		expect(itemRow?.deletedByCascade).toBe(true);
	});
});
