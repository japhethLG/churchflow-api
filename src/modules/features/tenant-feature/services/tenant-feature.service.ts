import type { AuthUser } from "@infrastructure/firebase-auth/types/auth-user.type";
import type { PrismaClientService } from "@infrastructure/prisma-client/prisma-client.service";
import type { AuditService } from "@modules/core/audit/services/audit.service";
import { TenantService } from "@modules/core/tenant/services/tenant.service";
import { Injectable } from "@nestjs/common";
import { AuditAction, MemberRole, type Tenant } from "@prisma/client";
import dayjs from "@shared/dayjs";

import type {
	CreateTenantRequestDto,
	RenameTenantRequestDto,
	UpdateTenantRequestDto,
} from "../dto/tenant.request.dto";
import type {
	TenantAdminPreviewDto,
	TenantListItemDto,
} from "../dto/tenant.response.dto";

@Injectable()
export class TenantFeatureService {
	constructor(
		private readonly tenantService: TenantService,
		private readonly auditService: AuditService,
		private readonly prisma: PrismaClientService,
	) {}

	async create(user: AuthUser, data: CreateTenantRequestDto): Promise<Tenant> {
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

	async list(): Promise<TenantListItemDto[]> {
		// Include soft-deleted so super-admin can see and restore archived tenants.
		const tenants = await this.prisma.tenant.findMany({
			orderBy: { createdAt: "desc" },
		});
		return Promise.all(tenants.map((t) => this.enrichTenant(t)));
	}

	private async enrichTenant(tenant: Tenant): Promise<TenantListItemDto> {
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

		const adminsPreview: TenantAdminPreviewDto[] = adminsRaw.map((m) => ({
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
		data: UpdateTenantRequestDto,
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
		data: RenameTenantRequestDto,
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
