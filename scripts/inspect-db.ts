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
	console.log("Fetching some transactions from the DB...");
	const txs = await prisma.transaction.findMany({
		take: 10,
		orderBy: { date: "desc" },
	});

	for (const tx of txs) {
		console.log(
			`ID: ${tx.id}, Date: ${tx.date.toISOString()}, Amount: ${tx.amount}, Raw Date Obj:`,
			tx.date,
		);
	}

	// Let's test a sample date range search
	const dateFrom = new Date("2026-05-17T00:00:00.000Z");
	const dateTo = new Date("2026-05-18T23:59:59.999Z");

	console.log(
		`\nQuerying range: ${dateFrom.toISOString()} to ${dateTo.toISOString()}`,
	);
	const filtered = await prisma.transaction.findMany({
		where: {
			date: {
				gte: dateFrom,
				lte: dateTo,
			},
		},
	});

	console.log(`Found ${filtered.length} transactions in this range.`);
	for (const tx of filtered) {
		console.log(
			`- ID: ${tx.id}, Date: ${tx.date.toISOString()}, Amount: ${tx.amount}`,
		);
	}
}

main()
	.catch((e) => console.error(e))
	.finally(async () => {
		await prisma.$disconnect();
		await pool.end();
	});
