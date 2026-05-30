import { AuthUser } from "@infrastructure/firebase-auth/types/auth-user.type";
import { UserClaimsService } from "@infrastructure/firebase-auth/user-claims.service";
import { AuditService } from "@modules/core/audit/services/audit.service";
import { MemberService } from "@modules/core/member/services/member.service";
import { TenantService } from "@modules/core/tenant/services/tenant.service";
import { TransactionService } from "@modules/core/transaction/services/transaction.service";
import { UserService } from "@modules/core/user/services/user.service";
import { CACHE_MANAGER, type Cache } from "@nestjs/cache-manager";
import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import {
	AuditAction,
	MemberRole,
	type MemberRole as MemberRoleEnum,
} from "@prisma/client";
import dayjs from "@shared/dayjs";

// Internal query/result shapes — controllers translate their HTTP DTOs
// into these so the service does not depend on controller-side classes.
export interface AdminUsersQueryInput {
	search?: string;
	tenantId?: string;
	superAdminOnly?: boolean;
	skip?: number;
	take?: number;
	includeDeleted?: boolean;
	onlyDeleted?: boolean;
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
		private readonly tenantService: TenantService,
		private readonly memberService: MemberService,
		private readonly transactionService: TransactionService,
		private readonly userService: UserService,
		private readonly userClaims: UserClaimsService,
		private readonly auditService: AuditService,
		@Inject(CACHE_MANAGER) private readonly cache: Cache,
	) {}

	// Platform-wide counts for the super-admin dashboard. 7 cross-tenant
	// aggregates per call, so memoize for a minute — the numbers are coarse
	// and a super-admin reloading the dashboard shouldn't re-run them all.
	// toggleSuperAdmin() busts the key since it changes the super-admin count.
	private static readonly PLATFORM_STATS_CACHE_KEY = "platform:stats";
	private static readonly PLATFORM_STATS_TTL_MS = 60_000;

	async getPlatformStats(): Promise<PlatformStats> {
		return this.cache.wrap(
			AdminFeatureService.PLATFORM_STATS_CACHE_KEY,
			() => this.computePlatformStats(),
			AdminFeatureService.PLATFORM_STATS_TTL_MS,
		);
	}

	private async computePlatformStats(): Promise<PlatformStats> {
		// Anchor "this month" in UTC so the cutoff doesn't drift when the
		// process happens to run in a non-UTC container.
		const monthStart = dayjs.utc().startOf("month").toDate();
		const last30d = dayjs.utc().subtract(30, "day").toDate();

		const [
			totalTenants,
			createdThisMonth,
			superAdmins,
			totalAdmins,
			totalMembers,
			newMembersThisMonth,
			giftsAggregate,
		] = await Promise.all([
			this.tenantService.countAll(),
			this.tenantService.countCreatedSince(monthStart),
			this.userService.countSuperAdmins(),
			this.memberService.countAcrossTenants({ role: MemberRole.ADMIN }),
			this.memberService.countAcrossTenants(),
			this.memberService.countAcrossTenants({ createdSince: monthStart }),
			this.transactionService.aggregateAll({ since: last30d }),
		]);

		return {
			totalTenants,
			createdThisMonth,
			superAdmins,
			totalAdmins,
			totalMembers,
			newMembersThisMonth,
			giftsLast30dCount: giftsAggregate.count,
			giftsLast30dTotal: giftsAggregate.total,
		};
	}

	async listUsers(query: AdminUsersQueryInput): Promise<AdminUserListResult> {
		const { items, total } = await this.userService.listWithMemberships({
			search: query.search,
			tenantId: query.tenantId,
			superAdminOnly: query.superAdminOnly,
			skip: query.skip,
			take: query.take,
			includeDeleted: query.includeDeleted,
			onlyDeleted: query.onlyDeleted,
		});

		const users: AdminUser[] = items.map(({ user, memberships }) => ({
			id: user.id,
			email: user.email,
			displayName: user.displayName,
			photoUrl: user.photoUrl,
			isSuperAdmin: user.isSuperAdmin,
			createdAt: user.createdAt,
			memberships: memberships.map(
				(m): AdminUserMembership => ({
					tenantId: m.tenantId,
					tenantSlug: m.tenantSlug,
					tenantName: m.tenantName,
					memberId: m.memberId,
					role: m.role,
				}),
			),
		}));

		return { items: users, total };
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
		// The super-admin count just changed — drop the memoized stats.
		await this.cache.del(AdminFeatureService.PLATFORM_STATS_CACHE_KEY);

		await this.auditService.record({
			tenantId: null,
			actorUid: actor.firebaseUid,
			actorEmail: actor.email,
			action: AuditAction.ROLE_CHANGE,
			entity: "User",
			entityId: user.id,
			summary: `${data.isSuperAdmin ? "Promoted" : "Demoted"} ${user.email} ${data.isSuperAdmin ? "to" : "from"} super admin`,
		});

		const memberships = await this.memberService.getAllForUser(user.id);

		return {
			id: user.id,
			email: user.email,
			displayName: user.displayName,
			photoUrl: user.photoUrl,
			isSuperAdmin: user.isSuperAdmin,
			createdAt: user.createdAt,
			memberships: memberships.map(
				(m): AdminUserMembership => ({
					tenantId: m.tenantId,
					tenantSlug: m.tenantSlug,
					tenantName: m.tenantName,
					memberId: m.memberId,
					role: m.role,
				}),
			),
		};
	}
}
