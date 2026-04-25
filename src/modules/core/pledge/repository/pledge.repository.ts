import { Injectable } from '@nestjs/common';

import type { Pledge, Prisma } from '@prisma/client';

import { PrismaClientService } from '@infrastructure/prisma-client/prisma-client.service';

import type {
  CreatePledgeInput,
  PledgeFilters,
  UpdatePledgeInput,
} from '../pledge.types';

export interface PledgeListResult {
  items: Pledge[];
  total: number;
  sum: number;
}

@Injectable()
export class PledgeRepository {
  constructor(private readonly prisma: PrismaClientService) {}

  async create(data: CreatePledgeInput): Promise<Pledge> {
    return this.prisma.pledge.create({ data });
  }

  async findById(tenantId: string, id: string): Promise<Pledge | null> {
    return this.prisma.pledge.findFirst({ where: { id, tenantId, deletedAt: null } });
  }

  async findAll(tenantId: string, filters: PledgeFilters): Promise<PledgeListResult> {
    const where: Prisma.PledgeWhereInput = {
      tenantId,
      deletedAt: null,
      ...(filters.campaignId ? { campaignId: filters.campaignId } : {}),
      ...(filters.campaignItemId ? { campaignItemId: filters.campaignItemId } : {}),
      ...(filters.memberId ? { memberId: filters.memberId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
    };

    const [items, total, aggregate] = await Promise.all([
      this.prisma.pledge.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: filters.offset,
        take: filters.limit,
      }),
      this.prisma.pledge.count({ where }),
      this.prisma.pledge.aggregate({ where, _sum: { pledgedAmount: true } }),
    ]);

    return { items, total, sum: Number(aggregate._sum.pledgedAmount ?? 0) };
  }

  async update(_tenantId: string, id: string, data: UpdatePledgeInput): Promise<Pledge> {
    return this.prisma.pledge.update({ where: { id }, data });
  }

  async softDelete(_tenantId: string, id: string): Promise<Pledge> {
    return this.prisma.pledge.update({ where: { id }, data: { deletedAt: new Date() } });
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
