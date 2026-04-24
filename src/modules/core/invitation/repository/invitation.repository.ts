import { Injectable } from '@nestjs/common';

import { InvitationStatus, type Invitation } from '@prisma/client';

import { PrismaClientService } from '@infrastructure/prisma-client/prisma-client.service';

import type { CreateInvitationInput } from '../invitation.types';

@Injectable()
export class InvitationRepository {
  constructor(private readonly prisma: PrismaClientService) {}

  async create(data: CreateInvitationInput): Promise<Invitation> {
    return this.prisma.invitation.create({ data });
  }

  async findByToken(token: string): Promise<Invitation | null> {
    return this.prisma.invitation.findFirst({ where: { token, deletedAt: null } });
  }

  async findPendingByEmail(email: string): Promise<Invitation[]> {
    return this.prisma.invitation.findMany({
      where: { email, status: InvitationStatus.PENDING, deletedAt: null },
    });
  }

  async findPendingForTenant(tenantId: string): Promise<Invitation[]> {
    return this.prisma.invitation.findMany({
      where: { tenantId, status: InvitationStatus.PENDING, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Used for rate-limiting: how many invitations has this tenant issued in
  // the last `windowMs` milliseconds?
  async countRecentForTenant(tenantId: string, windowMs: number): Promise<number> {
    const since = new Date(Date.now() - windowMs);
    return this.prisma.invitation.count({
      where: { tenantId, createdAt: { gte: since } },
    });
  }

  async findPendingByTenantAndEmail(
    tenantId: string,
    email: string,
  ): Promise<Invitation | null> {
    return this.prisma.invitation.findFirst({
      where: {
        tenantId,
        email,
        status: InvitationStatus.PENDING,
        deletedAt: null,
      },
    });
  }

  async markAccepted(id: string): Promise<Invitation> {
    return this.prisma.invitation.update({
      where: { id },
      data: { status: InvitationStatus.ACCEPTED, acceptedAt: new Date() },
    });
  }

  async markExpired(id: string): Promise<Invitation> {
    return this.prisma.invitation.update({
      where: { id },
      data: { status: InvitationStatus.EXPIRED },
    });
  }

  async markCancelled(id: string): Promise<Invitation> {
    return this.prisma.invitation.update({
      where: { id },
      data: { status: InvitationStatus.CANCELLED },
    });
  }
}
