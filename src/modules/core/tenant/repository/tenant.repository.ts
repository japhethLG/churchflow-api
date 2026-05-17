import { PrismaClientService } from "@infrastructure/prisma-client/prisma-client.service";
import {
	applyStateFilter,
	restore,
	softDelete,
	withDeleted,
} from "@infrastructure/prisma-client/soft-delete";
import { Injectable } from "@nestjs/common";
import { Prisma, Tenant } from "@prisma/client";

import {
	CreateTenantInput,
	TenantFilters,
	UpdateTenantInput,
} from "../tenant.types";

@Injectable()
export class TenantRepository {
	constructor(private readonly prisma: PrismaClientService) {}

	async create(data: CreateTenantInput): Promise<Tenant> {
		return this.prisma.tenant.create({ data });
	}

	async findById(id: string): Promise<Tenant | null> {
		return this.prisma.tenant.findFirst({ where: { id } });
	}

	async findBySlug(slug: string): Promise<Tenant | null> {
		return this.prisma.tenant.findFirst({ where: { slug } });
	}

	// Resolves a tenant by either its UUID or slug — used by TenantGuard so
	// callers can use whichever identifier is in the URL. Returns null if no
	// match (soft-deleted rows are excluded by the extension).
	async findByIdOrSlug(idOrSlug: string): Promise<Tenant | null> {
		return this.prisma.tenant.findFirst({
			where: {
				OR: [{ id: idOrSlug }, { slug: idOrSlug }],
			},
		});
	}

	async findAll(filters: TenantFilters = {}): Promise<Tenant[]> {
		const { where, wrap } = applyStateFilter(
			"Tenant",
			{} as Prisma.TenantWhereInput,
			filters,
		);
		return this.prisma.tenant.findMany(
			wrap({ where, orderBy: { createdAt: "desc" as const } }),
		);
	}

	async countAll(): Promise<number> {
		return this.prisma.tenant.count();
	}

	async countCreatedSince(since: Date): Promise<number> {
		return this.prisma.tenant.count({ where: { createdAt: { gte: since } } });
	}

	// Includes tombstones — for super-admin views that need to surface and
	// restore archived tenants.
	async findAllIncludingDeleted(): Promise<Tenant[]> {
		return this.prisma.tenant.findMany(
			withDeleted("Tenant", { orderBy: { createdAt: "desc" } }),
		);
	}

	async findByIdIncludingDeleted(id: string): Promise<Tenant | null> {
		return this.prisma.tenant.findFirst(
			withDeleted("Tenant", { where: { id } }),
		);
	}

	// Lists all tenants a specific user is a member of, via the Member table.
	// Used by exchangeIdToken to build the tenantMemberships claim.
	async findAllForUser(
		userId: string,
	): Promise<Array<Tenant & { memberId: string; role: "ADMIN" | "USER" }>> {
		const rows = await this.prisma.member.findMany({
			where: { userId },
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

	// Slugs use a partial unique index (`WHERE deletedAt IS NULL`), so the
	// slot is reclaimable after archive. The extension's auto-filter scopes
	// this count to active tenants, which is the right check for "can I
	// create with this slug?".
	async slugExists(slug: string): Promise<boolean> {
		const count = await this.prisma.tenant.count({ where: { slug } });
		return count > 0;
	}

	// Soft-deletes the tenant via the cascade-aware helper (no composition
	// children today, but the helper records `deletedBy` and is consistent
	// with the other repos). Returns the tombstone.
	async softDelete(id: string, actorId: string | null): Promise<Tenant> {
		return this.prisma.$transaction(async (tx) => {
			await softDelete(tx, "Tenant", { where: { id }, actorId });
			return tx.tenant.findFirstOrThrow(
				withDeleted("Tenant", { where: { id } }),
			);
		});
	}

	async restore(id: string): Promise<Tenant> {
		return this.prisma.$transaction(async (tx) => {
			await restore(tx, "Tenant", { where: { id } });
			return tx.tenant.findFirstOrThrow({ where: { id } });
		});
	}
}
