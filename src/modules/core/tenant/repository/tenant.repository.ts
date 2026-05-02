import type { PrismaClientService } from "@infrastructure/prisma-client/prisma-client.service";
import { Injectable } from "@nestjs/common";
import type { Tenant } from "@prisma/client";
import dayjs from "@shared/dayjs";

import type { CreateTenantInput, UpdateTenantInput } from "../tenant.types";

@Injectable()
export class TenantRepository {
	constructor(private readonly prisma: PrismaClientService) {}

	async create(data: CreateTenantInput): Promise<Tenant> {
		return this.prisma.tenant.create({ data });
	}

	async findById(id: string): Promise<Tenant | null> {
		return this.prisma.tenant.findFirst({ where: { id, deletedAt: null } });
	}

	async findBySlug(slug: string): Promise<Tenant | null> {
		return this.prisma.tenant.findFirst({ where: { slug, deletedAt: null } });
	}

	// Resolves a tenant by either its UUID or slug — used by TenantGuard so
	// callers can use whichever identifier is in the URL. Returns null if no
	// match (soft-deleted rows are excluded).
	async findByIdOrSlug(idOrSlug: string): Promise<Tenant | null> {
		return this.prisma.tenant.findFirst({
			where: {
				OR: [{ id: idOrSlug }, { slug: idOrSlug }],
				deletedAt: null,
			},
		});
	}

	async findAll(): Promise<Tenant[]> {
		return this.prisma.tenant.findMany({
			where: { deletedAt: null },
			orderBy: { createdAt: "desc" },
		});
	}

	// Lists all tenants a specific user is a member of, via the Member table.
	// Used by exchangeIdToken to build the tenantMemberships claim.
	async findAllForUser(
		userId: string,
	): Promise<Array<Tenant & { memberId: string; role: "ADMIN" | "USER" }>> {
		const rows = await this.prisma.member.findMany({
			where: { userId, deletedAt: null, tenant: { deletedAt: null } },
			include: { tenant: true },
		});
		return rows.map((m) => ({
			...m.tenant,
			memberId: m.id,
			role: m.role as "ADMIN" | "USER",
		}));
	}

	async update(id: string, data: UpdateTenantInput): Promise<Tenant> {
		return this.prisma.tenant.update({ where: { id }, data });
	}

	async updateSlug(id: string, slug: string): Promise<Tenant> {
		return this.prisma.tenant.update({ where: { id }, data: { slug } });
	}

	async softDelete(id: string): Promise<Tenant> {
		return this.prisma.tenant.update({
			where: { id },
			data: { deletedAt: dayjs().toDate() },
		});
	}

	async restore(id: string): Promise<Tenant> {
		return this.prisma.tenant.update({
			where: { id },
			data: { deletedAt: null },
		});
	}

	async slugExists(slug: string): Promise<boolean> {
		const count = await this.prisma.tenant.count({ where: { slug } });
		return count > 0;
	}
}
