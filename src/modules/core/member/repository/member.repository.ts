import { Injectable } from '@nestjs/common';

import type { Member, Prisma } from '@prisma/client';

import { PrismaClientService } from '@infrastructure/prisma-client/prisma-client.service';

import type { CreateMemberInput, MemberFilters, UpdateMemberInput } from '../member.types';

export interface MemberListResult {
  items: Member[];
  total: number;
}

@Injectable()
export class MemberRepository {
  constructor(private readonly prisma: PrismaClientService) {}

  async create(data: CreateMemberInput): Promise<Member> {
    return this.prisma.member.create({ data });
  }

  async findById(tenantId: string, id: string): Promise<Member | null> {
    return this.prisma.member.findFirst({ where: { id, tenantId, deletedAt: null } });
  }

  async findByUserId(tenantId: string, userId: string): Promise<Member | null> {
    return this.prisma.member.findFirst({ where: { tenantId, userId, deletedAt: null } });
  }

  async findAll(tenantId: string, filters: MemberFilters): Promise<MemberListResult> {
    const where: Prisma.MemberWhereInput = {
      tenantId,
      deletedAt: null,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.search
        ? {
            OR: [
              { firstName: { contains: filters.search, mode: 'insensitive' } },
              { lastName: { contains: filters.search, mode: 'insensitive' } },
              { email: { contains: filters.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.member.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: filters.offset,
        take: filters.limit,
      }),
      this.prisma.member.count({ where }),
    ]);

    return { items, total };
  }

  async update(_tenantId: string, id: string, data: UpdateMemberInput): Promise<Member> {
    return this.prisma.member.update({ where: { id }, data });
  }

  async softDelete(_tenantId: string, id: string): Promise<Member> {
    return this.prisma.member.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}
