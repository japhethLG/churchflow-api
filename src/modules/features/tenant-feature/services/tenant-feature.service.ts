import { AuthUser } from "@infrastructure/firebase-auth/types/auth-user.type";
import { PrismaClientService } from "@infrastructure/prisma-client/prisma-client.service";
import { AuditService } from "@modules/core/audit/services/audit.service";
import { TenantService } from "@modules/core/tenant/services/tenant.service";
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
		private readonly auditService: AuditService,
		private readonly prisma: PrismaClientService,
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

	async list(): Promise<TenantListItem[]> {
		// Include soft-deleted so super-admin can see and restore archived tenants.
		const tenants = await this.prisma.tenant.findMany({
			orderBy: { createdAt: "desc" },
		});
		return Promise.all(tenants.map((t) => this.enrichTenant(t)));
	}

	private async enrichTenant(tenant: Tenant): Promise<TenantListItem> {
		const monthStart = dayjs().startOf("month").toDate();

		const [adminCount, memberCount, adminsRaw, giftsMtd] = await Promise.all([
			this.prisma.member.count({
				where: { tenantId: tenant.id, deletedAt: null, role: MemberRole.ADMIN },
			}),
			this.prisma.member.count({
				where: { tenantId: tenant.id, deletedAt: null },
			}),
			this.prisma.member.findMany({
				where: { tenantId: tenant.id, deletedAt: null, role: MemberRole.ADMIN },
				include: { user: { select: { displayName: true, photoUrl: true } } },
				orderBy: { createdAt: "asc" },
				take: 3,
			}),
			this.prisma.transaction.aggregate({
				where: {
					tenantId: tenant.id,
					deletedAt: null,
					date: { gte: monthStart },
				},
				_sum: { amount: true },
				_count: { _all: true },
			}),
		]);

		const adminsPreview: TenantAdminPreview[] = adminsRaw.map((m) => ({
			memberId: m.id,
			displayName: m.user?.displayName ?? `${m.firstName} ${m.lastName}`,
			photoUrl: m.user?.photoUrl ?? null,
		}));

		return {
			...tenant,
			adminCount,
			memberCount,
			adminsPreview,
			giftsMtdCount: giftsMtd._count._all,
			giftsMtdTotal: Number(giftsMtd._sum.amount ?? 0),
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
		const tenant = await this.tenantService.delete(id);
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
