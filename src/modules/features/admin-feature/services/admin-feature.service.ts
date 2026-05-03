import { AuthUser } from "@infrastructure/firebase-auth/types/auth-user.type";
import { UserClaimsService } from "@infrastructure/firebase-auth/user-claims.service";
import { PrismaClientService } from "@infrastructure/prisma-client/prisma-client.service";
import { AuditService } from "@modules/core/audit/services/audit.service";
import { UserService } from "@modules/core/user/services/user.service";
import { BadRequestException, Injectable } from "@nestjs/common";
import { AuditAction, type MemberRole as MemberRoleEnum } from "@prisma/client";
import { MemberRole } from "@prisma/client";
import dayjs from "@shared/dayjs";

// Internal query/result shapes — controllers translate their HTTP DTOs
// into these so the service does not depend on controller-side classes.
export interface AdminUsersQueryInput {
	search?: string;
	tenantId?: string;
	superAdminOnly?: boolean;
	skip?: number;
	take?: number;
}

export interface ToggleSuperAdminInput {
	isSuperAdmin: boolean;
}

export interface PlatformStats {
	totalTenants: number;
	createdThisMonth: number;
	superAdmins: number;
	totalAdmins: number;
	totalMembers: number;
	newMembersThisMonth: number;
	giftsLast30dCount: number;
	giftsLast30dTotal: number;
}

export interface AdminUserMembership {
	tenantId: string;
	tenantSlug: string;
	tenantName: string;
	memberId: string;
	role: MemberRoleEnum;
}

export interface AdminUser {
	id: string;
	email: string;
	displayName: string;
	photoUrl: string | null;
	isSuperAdmin: boolean;
	memberships: AdminUserMembership[];
	createdAt: Date;
}

export interface AdminUserListResult {
	items: AdminUser[];
	total: number;
}

@Injectable()
export class AdminFeatureService {
	constructor(
		private readonly prisma: PrismaClientService,
		private readonly userService: UserService,
		private readonly userClaims: UserClaimsService,
		private readonly auditService: AuditService,
	) {}

	async getPlatformStats(): Promise<PlatformStats> {
		const monthStart = dayjs().startOf("month").toDate();
		const last30d = dayjs().subtract(30, "day").toDate();

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
			this.prisma.tenant.count({
				where: { deletedAt: null, createdAt: { gte: monthStart } },
			}),
			this.prisma.user.count({ where: { isSuperAdmin: true } }),
			this.prisma.member.count({
				where: {
					deletedAt: null,
					role: MemberRole.ADMIN,
					tenant: { deletedAt: null },
				},
			}),
			this.prisma.member.count({
				where: { deletedAt: null, tenant: { deletedAt: null } },
			}),
			this.prisma.member.count({
				where: {
					deletedAt: null,
					createdAt: { gte: monthStart },
					tenant: { deletedAt: null },
				},
			}),
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

	async listUsers(query: AdminUsersQueryInput): Promise<AdminUserListResult> {
		const take = query.take ?? 50;
		const skip = query.skip ?? 0;

		const where: Record<string, unknown> = {
			...(query.superAdminOnly ? { isSuperAdmin: true } : {}),
		};

		if (query.search) {
			where.OR = [
				{ email: { contains: query.search, mode: "insensitive" } },
				{ displayName: { contains: query.search, mode: "insensitive" } },
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
						include: {
							tenant: { select: { id: true, slug: true, name: true } },
						},
					},
				},
				orderBy: { createdAt: "desc" },
				skip,
				take,
			}),
			this.prisma.user.count({ where }),
		]);

		const items: AdminUser[] = users.map((u) => ({
			id: u.id,
			email: u.email,
			displayName: u.displayName,
			photoUrl: u.photoUrl,
			isSuperAdmin: u.isSuperAdmin,
			createdAt: u.createdAt,
			memberships: u.memberships.map(
				(m): AdminUserMembership => ({
					tenantId: m.tenant.id,
					tenantSlug: m.tenant.slug,
					tenantName: m.tenant.name,
					memberId: m.id,
					role: m.role,
				}),
			),
		}));

		return { items, total };
	}

	async toggleSuperAdmin(
		actor: AuthUser,
		userId: string,
		data: ToggleSuperAdminInput,
	): Promise<AdminUser> {
		if (actor.firebaseUid) {
			const actorUser = await this.userService.findByFirebaseUid(
				actor.firebaseUid,
			);
			if (actorUser?.id === userId && !data.isSuperAdmin) {
				throw new BadRequestException(
					"You cannot demote yourself from super admin.",
				);
			}
		}

		const user = await this.userService.update(userId, {
			isSuperAdmin: data.isSuperAdmin,
		});
		await this.userClaims.refreshFor(user.firebaseUid);

		await this.auditService.record({
			tenantId: null,
			actorUid: actor.firebaseUid,
			actorEmail: actor.email,
			action: AuditAction.ROLE_CHANGE,
			entity: "User",
			entityId: user.id,
			summary: `${data.isSuperAdmin ? "Promoted" : "Demoted"} ${user.email} ${data.isSuperAdmin ? "to" : "from"} super admin`,
		});

		const members = await this.prisma.member.findMany({
			where: { userId: user.id, deletedAt: null, tenant: { deletedAt: null } },
			include: { tenant: { select: { id: true, slug: true, name: true } } },
			orderBy: { createdAt: "asc" },
		});

		return {
			id: user.id,
			email: user.email,
			displayName: user.displayName,
			photoUrl: user.photoUrl,
			isSuperAdmin: user.isSuperAdmin,
			createdAt: user.createdAt,
			memberships: members.map(
				(m): AdminUserMembership => ({
					tenantId: m.tenant.id,
					tenantSlug: m.tenant.slug,
					tenantName: m.tenant.name,
					memberId: m.id,
					role: m.role,
				}),
			),
		};
	}
}
