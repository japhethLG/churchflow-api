import { AuthUser } from "@infrastructure/firebase-auth/types/auth-user.type";
import { AuditService } from "@modules/core/audit/services/audit.service";
import { CampaignService } from "@modules/core/campaign/services/campaign.service";
import { MemberService } from "@modules/core/member/services/member.service";
import { TenantService } from "@modules/core/tenant/services/tenant.service";
import { TransactionService } from "@modules/core/transaction/services/transaction.service";
import { UserService } from "@modules/core/user/services/user.service";
import { Injectable } from "@nestjs/common";
import {
	AuditAction,
	CampaignStatus,
	MemberRole,
	type Tenant,
	type TransactionType,
} from "@prisma/client";
import dayjs from "@shared/dayjs";

// Internal DTOs — controllers translate their HTTP shapes into these.
export interface CreateTenantServiceInput {
	slug: string;
	name: string;
	address?: string;
	phone?: string;
	email?: string;
	logoUrl?: string;
	customTransactionTypes?: string[];
}

export interface UpdateTenantServiceInput {
	name?: string;
	address?: string;
	phone?: string;
	email?: string;
	logoUrl?: string;
	customTransactionTypes?: string[];
}

export interface RenameTenantServiceInput {
	slug: string;
}

export interface TenantAdminPreview {
	memberId: string;
	displayName: string;
	photoUrl: string | null;
}

export interface TenantListItem extends Tenant {
	adminCount: number;
	memberCount: number;
	adminsPreview: TenantAdminPreview[];
	giftsMtdCount: number;
	giftsMtdTotal: number;
}

export interface MyChurchSummary {
	receivedThisMonth: number;
	receivedThisMonthCount: number;
	receivedYearToDate: number;
	receivedLastMonth: number;
	byTypeThisMonth: Array<{
		type: TransactionType;
		total: number;
		count: number;
	}>;
	activeCampaignCount: number;
	upcomingCampaignCount: number;
	memberCount: number;
	newMembersThisMonth: number;
}

@Injectable()
export class TenantFeatureService {
	constructor(
		private readonly tenantService: TenantService,
		private readonly memberService: MemberService,
		private readonly transactionService: TransactionService,
		private readonly campaignService: CampaignService,
		private readonly userService: UserService,
		private readonly auditService: AuditService,
	) {}

	async create(
		user: AuthUser,
		data: CreateTenantServiceInput,
	): Promise<Tenant> {
		const tenant = await this.tenantService.create({
			...data,
			createdBy: user.firebaseUid,
		});
		await this.auditService.record({
			tenantId: tenant.id,
			actorUid: user.firebaseUid,
			actorEmail: user.email,
			action: AuditAction.CREATE,
			entity: "Tenant",
			entityId: tenant.id,
			summary: `Created church "${tenant.name}" (slug=${tenant.slug})`,
		});
		return tenant;
	}

	async list(
		filters: { includeDeleted?: boolean; onlyDeleted?: boolean } = {},
	): Promise<TenantListItem[]> {
		// Default = active only. Pass `includeDeleted` / `onlyDeleted` to
		// surface tombstones for the super-admin's 3-state archive filter.
		const tenants = await this.tenantService.getAll(filters);
		return Promise.all(tenants.map((t) => this.enrichTenant(t)));
	}

	private async enrichTenant(tenant: Tenant): Promise<TenantListItem> {
		const monthStart = dayjs.utc().startOf("month").toDate();

		const [adminCount, memberCount, adminsRaw, giftsMtd] = await Promise.all([
			this.memberService.countForTenant(tenant.id, { role: MemberRole.ADMIN }),
			this.memberService.countForTenant(tenant.id),
			this.memberService.getAdminsPreview(tenant.id, 3),
			this.transactionService.aggregateForTenant(tenant.id, {
				since: monthStart,
			}),
		]);

		const adminsPreview: TenantAdminPreview[] = adminsRaw.map((m) => ({
			memberId: m.memberId,
			displayName: m.displayName ?? `${m.firstName} ${m.lastName}`,
			photoUrl: m.photoUrl,
		}));

		return {
			...tenant,
			adminCount,
			memberCount,
			adminsPreview,
			giftsMtdCount: giftsMtd.count,
			giftsMtdTotal: giftsMtd.total,
		};
	}

	async getByIdOrSlug(idOrSlug: string): Promise<Tenant> {
		return this.tenantService.getByIdOrSlug(idOrSlug);
	}

	// Members-safe church pulse — aggregate sums + counts only. No
	// per-row reads of other members' transactions or pledges. The
	// "this month" window is UTC start-of-month inclusive → now; "last
	// month" is start-of-prior-month → end-of-prior-month.
	async getMyChurchSummary(tenantId: string): Promise<MyChurchSummary> {
		const now = dayjs.utc();
		const monthStart = now.startOf("month").toDate();
		const monthEnd = now.endOf("day").toDate();
		const lastMonthStart = now.subtract(1, "month").startOf("month").toDate();
		const lastMonthEnd = now.subtract(1, "month").endOf("month").toDate();
		const yearStart = now.startOf("year").toDate();

		const [
			thisMonth,
			lastMonth,
			yearToDate,
			activeCampaigns,
			upcomingCampaigns,
			memberCount,
			newMembers,
		] = await Promise.all([
			this.transactionService.summary(tenantId, monthStart, monthEnd),
			this.transactionService.summary(tenantId, lastMonthStart, lastMonthEnd),
			this.transactionService.summary(tenantId, yearStart, monthEnd),
			this.campaignService.getAll(tenantId, {
				status: CampaignStatus.ACTIVE,
				limit: 1,
			}),
			this.campaignService.getAll(tenantId, {
				status: CampaignStatus.DRAFT,
				limit: 1,
			}),
			this.memberService.countForTenant(tenantId),
			// New members "this month" = createdAt within the current calendar
			// month. countForTenant doesn't take a date filter today, so we
			// list with a wide limit and count in JS. Tenants are bounded by
			// human attendance — fine for a once-per-load metric.
			this.memberService.getAll(tenantId, { limit: 2000 }),
		]);

		const newMembersThisMonth = newMembers.items.filter((m) =>
			dayjs(m.createdAt).isAfter(monthStart),
		).length;

		return {
			receivedThisMonth: thisMonth.total,
			receivedThisMonthCount: thisMonth.count,
			receivedYearToDate: yearToDate.total,
			receivedLastMonth: lastMonth.total,
			byTypeThisMonth: thisMonth.byType,
			activeCampaignCount: activeCampaigns.total,
			upcomingCampaignCount: upcomingCampaigns.total,
			memberCount,
			newMembersThisMonth,
		};
	}

	async update(
		user: AuthUser,
		id: string,
		data: UpdateTenantServiceInput,
	): Promise<Tenant> {
		const tenant = await this.tenantService.update(id, data);
		await this.auditService.record({
			tenantId: tenant.id,
			actorUid: user.firebaseUid,
			actorEmail: user.email,
			action: AuditAction.UPDATE,
			entity: "Tenant",
			entityId: tenant.id,
			diff: { after: data },
		});
		return tenant;
	}

	async rename(
		user: AuthUser,
		id: string,
		data: RenameTenantServiceInput,
	): Promise<Tenant> {
		const before = await this.tenantService.getById(id);
		const tenant = await this.tenantService.rename(id, data.slug);
		await this.auditService.record({
			tenantId: tenant.id,
			actorUid: user.firebaseUid,
			actorEmail: user.email,
			action: AuditAction.UPDATE,
			entity: "Tenant",
			entityId: tenant.id,
			summary: `Renamed slug "${before.slug}" → "${tenant.slug}"`,
			diff: { before: { slug: before.slug }, after: { slug: tenant.slug } },
		});
		return tenant;
	}

	async delete(user: AuthUser, id: string): Promise<Tenant> {
		const actor = await this.userService.findByFirebaseUid(user.firebaseUid);
		const tenant = await this.tenantService.delete(id, actor?.id ?? null);
		await this.auditService.record({
			tenantId: tenant.id,
			actorUid: user.firebaseUid,
			actorEmail: user.email,
			action: AuditAction.DELETE,
			entity: "Tenant",
			entityId: tenant.id,
		});
		return tenant;
	}

	async restore(user: AuthUser, id: string): Promise<Tenant> {
		const tenant = await this.tenantService.restore(id);
		await this.auditService.record({
			tenantId: tenant.id,
			actorUid: user.firebaseUid,
			actorEmail: user.email,
			action: AuditAction.RESTORE,
			entity: "Tenant",
			entityId: tenant.id,
		});
		return tenant;
	}

	suggestSlug(name: string): string {
		return TenantService.suggestSlug(name);
	}
}
