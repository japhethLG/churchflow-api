// One-time backfill for `Pledge.paidAmount`.
//
// Sums all non-deleted transactions per pledge and writes the result
// back to `Pledge.paidAmount`. Idempotent — safe to re-run if the
// service-side maintenance ever drifts (it will overwrite, not
// accumulate). Bypasses the soft-delete extension by using a plain
// PrismaClient so we can see all tombstones if we needed to (we
// explicitly exclude them by filtering `deletedAt: null`).

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
	throw new Error("DATABASE_URL is not set");
}

const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
	const paidGroups = await prisma.transaction.groupBy({
		by: ["pledgeId"],
		where: { pledgeId: { not: null }, deletedAt: null },
		_sum: { amount: true },
	});

	console.log(`Backfilling paidAmount on ${paidGroups.length} pledges...`);

	let updated = 0;
	for (const g of paidGroups) {
		if (!g.pledgeId) {
			continue;
		}
		const amount = g._sum.amount ?? 0;
		await prisma.pledge.update({
			where: { id: g.pledgeId },
			data: { paidAmount: amount },
		});
		updated += 1;
	}
	console.log(`paidAmount: updated ${updated} pledges.`);

	// Backfill the ACTIVE↔FULFILLED auto-transition for existing rows.
	// CANCELLED pledges are never touched — admins manage that manually.
	const all = await prisma.pledge.findMany({
		where: { deletedAt: null, status: { in: ["ACTIVE", "FULFILLED"] } },
		select: {
			id: true,
			status: true,
			paidAmount: true,
			pledgedAmount: true,
		},
	});
	let flipped = 0;
	for (const p of all) {
		const paid = Number(p.paidAmount);
		const pledged = Number(p.pledgedAmount);
		const desired = paid >= pledged ? "FULFILLED" : "ACTIVE";
		if (p.status !== desired) {
			await prisma.pledge.update({
				where: { id: p.id },
				data: { status: desired },
			});
			flipped += 1;
		}
	}
	console.log(`status: flipped ${flipped} pledges.`);
}

main()
	.catch((e) => {
		console.error(e);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
		await pool.end();
	});
