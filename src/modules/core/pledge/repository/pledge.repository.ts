import { PrismaClientService } from "@infrastructure/prisma-client/prisma-client.service";
import {
	softDelete,
	withDeleted,
} from "@infrastructure/prisma-client/soft-delete";
import { Injectable } from "@nestjs/common";
import { Pledge, Prisma } from "@prisma/client";

import {
	CreatePledgeInput,
	PledgeFilters,
	UpdatePledgeInput,
} from "../pledge.types";

export type PledgeWithAmounts = Pledge & {
	paidAmount: number;
	remainingAmount: number;
};

export interface PledgeListResult {
	items: PledgeWithAmounts[];
	total: number;
	sum: number;
}

@Injectable()
export class PledgeRepository {
	constructor(private readonly prisma: PrismaClientService) {}

	async create(data: CreatePledgeInput): Promise<Pledge> {
		return this.prisma.pledge.create({ data });
	}

	async findById(
		tenantId: string,
		id: string,
	): Promise<PledgeWithAmounts | null> {
		const [pledge, aggregate] = await Promise.all([
			this.prisma.pledge.findFirst({
				where: { id, tenantId },
			}),
			this.prisma.transaction.aggregate({
				where: { pledgeId: id },
				_sum: { amount: true },
			}),
		]);
		if (!pledge) {
			return null;
		}
		const paidAmount = Number(aggregate._sum.amount ?? 0);
		return {
			...pledge,
			paidAmount,
			remainingAmount: Math.max(0, Number(pledge.pledgedAmount) - paidAmount),
		};
	}

	async findAll(
		tenantId: string,
		filters: PledgeFilters,
	): Promise<PledgeListResult> {
		const where: Prisma.PledgeWhereInput = {
			tenantId,
			...(filters.campaignId ? { campaignId: filters.campaignId } : {}),
			...(filters.campaignItemId
				? { campaignItemId: filters.campaignItemId }
				: {}),
			...(filters.memberId ? { memberId: filters.memberId } : {}),
			...(filters.status ? { status: filters.status } : {}),
		};

		const [items, total, aggregate] = await Promise.all([
			this.prisma.pledge.findMany({
				where,
				orderBy: { createdAt: "desc" },
				skip: filters.offset,
				take: filters.limit,
			}),
			this.prisma.pledge.count({ where }),
			this.prisma.pledge.aggregate({ where, _sum: { pledgedAmount: true } }),
		]);

		const pledgeIds = items.map((p) => p.id);
		const paidGroups =
			pledgeIds.length > 0
				? await this.prisma.transaction.groupBy({
						by: ["pledgeId"],
						where: { pledgeId: { in: pledgeIds } },
						_sum: { amount: true },
					})
				: [];

		const paidByPledgeId = Object.fromEntries(
			paidGroups
				.filter((g) => g.pledgeId !== null)
				.map((g) => [g.pledgeId as string, Number(g._sum.amount ?? 0)]),
		);

		const itemsWithAmounts: PledgeWithAmounts[] = items.map((p) => {
			const paidAmount = paidByPledgeId[p.id] ?? 0;
			return {
				...p,
				paidAmount,
				remainingAmount: Math.max(0, Number(p.pledgedAmount) - paidAmount),
			};
		});

		return {
			items: itemsWithAmounts,
			total,
			sum: Number(aggregate._sum.pledgedAmount ?? 0),
		};
	}

	async update(
		_tenantId: string,
		id: string,
		data: UpdatePledgeInput,
	): Promise<Pledge> {
		return this.prisma.pledge.update({ where: { id }, data });
	}

	async softDelete(
		tenantId: string,
		id: string,
		actorId: string | null,
	): Promise<Pledge> {
		return this.prisma.$transaction(async (tx) => {
			await softDelete(tx, "Pledge", {
				where: { id, tenantId },
				actorId,
			});
			return tx.pledge.findFirstOrThrow(
				withDeleted("Pledge", { where: { id, tenantId } }),
			);
		});
	}

	async reassignMember(
		tenantId: string,
		fromMemberId: string,
		toMemberId: string,
	): Promise<number> {
		const result = await this.prisma.pledge.updateMany({
			where: { tenantId, memberId: fromMemberId },
			data: { memberId: toMemberId },
		});
		return result.count;
	}
}
