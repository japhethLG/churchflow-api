import { AuthUser } from "@infrastructure/firebase-auth/types/auth-user.type";
import { AuditService } from "@modules/core/audit/services/audit.service";
import { MemberService } from "@modules/core/member/services/member.service";
import { TenantService } from "@modules/core/tenant/services/tenant.service";
import { TransactionService } from "@modules/core/transaction/services/transaction.service";
import { UserService } from "@modules/core/user/services/user.service";
import { Injectable } from "@nestjs/common";
import { AuditAction, MemberRole, type Tenant } from "@prisma/client";
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

@Injectable()
export class TenantFeatureService {
	constructor(
		private readonly tenantService: TenantService,
		private readonly memberService: MemberService,
		private readonly transactionService: TransactionService,
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
