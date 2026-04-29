import { BadRequestException, Injectable } from '@nestjs/common';

import { AuditAction, MemberRole } from '@prisma/client';

import { PrismaClientService } from '@infrastructure/prisma-client/prisma-client.service';
import { UserClaimsService } from '@infrastructure/firebase-auth/user-claims.service';

import { AuditService } from '@modules/core/audit/services/audit.service';
import { UserService } from '@modules/core/user/services/user.service';

import type { AuthUser } from '@infrastructure/firebase-auth/types/auth-user.type';

import type {
  AdminUserDto,
  AdminUserListResponseDto,
  AdminUserMembershipDto,
  PlatformStatsDto,
} from '../dto/admin.response.dto';
import type { AdminUsersQueryDto, ToggleSuperAdminRequestDto } from '../dto/admin.request.dto';

@Injectable()
export class AdminFeatureService {
  constructor(
    private readonly prisma: PrismaClientService,
    private readonly userService: UserService,
    private readonly userClaims: UserClaimsService,
    private readonly auditService: AuditService,
  ) {}

  async getPlatformStats(): Promise<PlatformStatsDto> {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const last30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalTenants,
      createdThisMonth,
      superAdmins,
      totalAdmins,
      totalMembers,
      newMembersThisMonth,
      giftsAggregate,
    ] = await Promise.all([
      this.prisma.tenant.count({ where: { deletedAt: null } }),
      this.prisma.tenant.count({ where: { deletedAt: null, createdAt: { gte: monthStart } } }),
      this.prisma.user.count({ where: { isSuperAdmin: true } }),
      this.prisma.member.count({ where: { deletedAt: null, role: MemberRole.ADMIN, tenant: { deletedAt: null } } }),
      this.prisma.member.count({ where: { deletedAt: null, tenant: { deletedAt: null } } }),
      this.prisma.member.count({ where: { deletedAt: null, createdAt: { gte: monthStart }, tenant: { deletedAt: null } } }),
      this.prisma.transaction.aggregate({
        where: { deletedAt: null, date: { gte: last30d } },
        _sum: { amount: true },
        _count: { _all: true },
      }),
    ]);

    return {
      totalTenants,
      createdThisMonth,
      superAdmins,
      totalAdmins,
      totalMembers,
      newMembersThisMonth,
      giftsLast30dCount: giftsAggregate._count._all,
      giftsLast30dTotal: Number(giftsAggregate._sum.amount ?? 0),
    };
  }

  async listUsers(query: AdminUsersQueryDto): Promise<AdminUserListResponseDto> {
    const take = query.take ?? 50;
    const skip = query.skip ?? 0;

    const where: Record<string, unknown> = { ...(query.superAdminOnly ? { isSuperAdmin: true } : {}) };

    if (query.search) {
      where.OR = [
        { email: { contains: query.search, mode: 'insensitive' } },
        { displayName: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.tenantId) {
      where.memberships = {
        some: { tenantId: query.tenantId, deletedAt: null },
      };
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        include: {
          memberships: {
            where: { deletedAt: null, tenant: { deletedAt: null } },
            include: { tenant: { select: { id: true, slug: true, name: true } } },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.user.count({ where }),
    ]);

    const items: AdminUserDto[] = users.map((u) => ({
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      photoUrl: u.photoUrl,
      isSuperAdmin: u.isSuperAdmin,
      createdAt: u.createdAt,
      memberships: u.memberships.map((m): AdminUserMembershipDto => ({
        tenantId: m.tenant.id,
        tenantSlug: m.tenant.slug,
        tenantName: m.tenant.name,
        memberId: m.id,
        role: m.role,
      })),
    }));

    return { items, total };
  }

  async toggleSuperAdmin(
    actor: AuthUser,
    userId: string,
    data: ToggleSuperAdminRequestDto,
  ): Promise<AdminUserDto> {
    if (actor.firebaseUid) {
      const actorUser = await this.userService.findByFirebaseUid(actor.firebaseUid);
      if (actorUser?.id === userId && !data.isSuperAdmin) {
        throw new BadRequestException('You cannot demote yourself from super admin.');
      }
    }

    const user = await this.userService.update(userId, { isSuperAdmin: data.isSuperAdmin });
    await this.userClaims.refreshFor(user.firebaseUid);

    await this.auditService.record({
      tenantId: null,
      actorUid: actor.firebaseUid,
      actorEmail: actor.email,
      action: AuditAction.ROLE_CHANGE,
      entity: 'User',
      entityId: user.id,
      summary: `${data.isSuperAdmin ? 'Promoted' : 'Demoted'} ${user.email} ${data.isSuperAdmin ? 'to' : 'from'} super admin`,
    });

    const members = await this.prisma.member.findMany({
      where: { userId: user.id, deletedAt: null, tenant: { deletedAt: null } },
      include: { tenant: { select: { id: true, slug: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });

    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      photoUrl: user.photoUrl,
      isSuperAdmin: user.isSuperAdmin,
      createdAt: user.createdAt,
      memberships: members.map((m): AdminUserMembershipDto => ({
        tenantId: m.tenant.id,
        tenantSlug: m.tenant.slug,
        tenantName: m.tenant.name,
        memberId: m.id,
        role: m.role,
      })),
    };
  }
}
