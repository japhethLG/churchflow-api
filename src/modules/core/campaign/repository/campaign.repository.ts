import { Injectable } from '@nestjs/common';

import type { Campaign, Prisma } from '@prisma/client';

import { PrismaClientService } from '@infrastructure/prisma-client/prisma-client.service';

import type {
  CampaignFilters,
  CreateCampaignInput,
  UpdateCampaignInput,
} from '../campaign.types';

export interface CampaignListResult {
  items: Campaign[];
  total: number;
}

@Injectable()
export class CampaignRepository {
  constructor(private readonly prisma: PrismaClientService) {}

  async create(data: CreateCampaignInput): Promise<Campaign> {
    return this.prisma.campaign.create({ data });
  }

  async findById(tenantId: string, id: string): Promise<Campaign | null> {
    return this.prisma.campaign.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
  }

  async findAll(tenantId: string, filters: CampaignFilters): Promise<CampaignListResult> {
    const where: Prisma.CampaignWhereInput = {
      tenantId,
      deletedAt: null,
      ...(filters.status ? { status: filters.status } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.campaign.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: filters.offset,
        take: filters.limit,
      }),
      this.prisma.campaign.count({ where }),
    ]);

    return { items, total };
  }

  async update(_tenantId: string, id: string, data: UpdateCampaignInput): Promise<Campaign> {
    return this.prisma.campaign.update({ where: { id }, data });
  }

  async softDelete(_tenantId: string, id: string): Promise<Campaign> {
    return this.prisma.campaign.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async restore(_tenantId: string, id: string): Promise<Campaign> {
    return this.prisma.campaign.update({ where: { id }, data: { deletedAt: null } });
  }

  async findByIdIncludingDeleted(tenantId: string, id: string): Promise<Campaign | null> {
    return this.prisma.campaign.findFirst({ where: { id, tenantId } });
  }

  // Per-campaign progress: pledge totals + transaction totals, both overall
  // and broken down by item. One SQL round-trip per aggregate.
  async progress(tenantId: string, campaignId: string) {
    const [pledgeAgg, txAgg, itemPledgeAgg, itemTxAgg] = await Promise.all([
      this.prisma.pledge.aggregate({
        where: { tenantId, campaignId, deletedAt: null },
        _sum: { pledgedAmount: true },
        _count: { _all: true },
      }),
      this.prisma.transaction.aggregate({
        where: { tenantId, campaignId, deletedAt: null },
        _sum: { amount: true },
      }),
      this.prisma.pledge.groupBy({
        by: ['campaignItemId'],
        where: { tenantId, campaignId, deletedAt: null },
        _sum: { pledgedAmount: true },
        _count: { _all: true },
      }),
      this.prisma.transaction.groupBy({
        by: ['campaignItemId'],
        where: { tenantId, campaignId, deletedAt: null },
        _sum: { amount: true },
      }),
    ]);

    return {
      pledgedAmount: Number(pledgeAgg._sum.pledgedAmount ?? 0),
      pledgeCount: pledgeAgg._count._all,
      raisedAmount: Number(txAgg._sum.amount ?? 0),
      byItemPledges: itemPledgeAgg.map((r) => ({
        itemId: r.campaignItemId,
        pledgedAmount: Number(r._sum.pledgedAmount ?? 0),
        pledgeCount: r._count._all,
      })),
      byItemTransactions: itemTxAgg.map((r) => ({
        itemId: r.campaignItemId,
        raisedAmount: Number(r._sum.amount ?? 0),
      })),
    };
  }
}
