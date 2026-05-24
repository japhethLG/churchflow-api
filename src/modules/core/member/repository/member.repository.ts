import { PrismaClientService } from "@infrastructure/prisma-client/prisma-client.service";
import {
	applyStateFilter,
	restore,
	softDelete,
	withDeleted,
} from "@infrastructure/prisma-client/soft-delete";
import { Injectable } from "@nestjs/common";
import { Member, MemberRole, Prisma } from "@prisma/client";

import {
	CreateMemberInput,
	MemberFilters,
	UpdateMemberInput,
} from "../member.types";

export interface MemberAdminPreview {
	memberId: string;
	firstName: string;
	lastName: string;
	displayName: string | null;
	photoUrl: string | null;
}

export interface MemberWithTenantInfo {
	memberId: string;
	role: MemberRole;
	tenantId: string;
	tenantSlug: string;
	tenantName: string;
	createdAt: Date;
}

export interface MemberListResult {
	items: Member[];
	total: number;
}

@Injectable()
export class MemberRepository {
	constructor(private readonly prisma: PrismaClientService) {}

	async create(data: CreateMemberInput): Promise<Member> {
		return this.prisma.member.create({ data });
	}

	async findById(tenantId: string, id: string): Promise<Member | null> {
		return this.prisma.member.findFirst({
			where: { id, tenantId },
		});
	}

	async findByIdIncludingDeleted(
		tenantId: string,
		id: string,
	): Promise<Member | null> {
		return this.prisma.member.findFirst(
			withDeleted("Member", { where: { id, tenantId } }),
		);
	}

	async findByUserId(tenantId: string, userId: string): Promise<Member | null> {
		return this.prisma.member.findFirst({
			where: { tenantId, userId },
		});
	}

	async findAll(
		tenantId: string,
		filters: MemberFilters,
	): Promise<MemberListResult> {
		const createdAt =
			filters.dateFrom || filters.dateTo
				? {
						...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
						...(filters.dateTo ? { lte: filters.dateTo } : {}),
					}
				: undefined;
		const baseWhere: Prisma.MemberWhereInput = {
			tenantId,
			...(filters.status ? { status: filters.status } : {}),
			...(createdAt ? { createdAt } : {}),
			...(filters.search
				? {
						OR: [
							{ firstName: { contains: filters.search, mode: "insensitive" } },
							{ lastName: { contains: filters.search, mode: "insensitive" } },
							{ email: { contains: filters.search, mode: "insensitive" } },
						],
					}
				: {}),
		};
		const { where, wrap } = applyStateFilter("Member", baseWhere, filters);

		const [items, total] = await Promise.all([
			this.prisma.member.findMany(
				wrap({
					where,
					orderBy: { createdAt: "desc" as const },
					skip: filters.offset,
					take: filters.limit,
				}),
			),
			this.prisma.member.count(wrap({ where })),
		]);

		return { items, total };
	}

	async update(
		_tenantId: string,
		id: string,
		data: UpdateMemberInput,
	): Promise<Member> {
		return this.prisma.member.update({ where: { id }, data });
	}

	// Tenant-scoped count. Pass `role` to narrow to a single role bucket.
	async countForTenant(
		tenantId: string,
		filters: { role?: MemberRole; createdSince?: Date } = {},
	): Promise<number> {
		return this.prisma.member.count({
			where: {
				tenantId,
				...(filters.role ? { role: filters.role } : {}),
				...(filters.createdSince
					? { createdAt: { gte: filters.createdSince } }
					: {}),
			},
		});
	}

	// Cross-tenant count for platform stats.
	async countAcrossTenants(
		filters: { role?: MemberRole; createdSince?: Date } = {},
	): Promise<number> {
		return this.prisma.member.count({
			where: {
				...(filters.role ? { role: filters.role } : {}),
				...(filters.createdSince
					? { createdAt: { gte: filters.createdSince } }
					: {}),
			},
		});
	}

	// Top-N admins of a tenant, joined to user for the display preview.
	// Used by the super-admin tenant list.
	async findAdminsPreview(
		tenantId: string,
		take: number,
	): Promise<MemberAdminPreview[]> {
		const admins = await this.prisma.member.findMany({
			where: { tenantId, role: MemberRole.ADMIN },
			include: { user: { select: { displayName: true, photoUrl: true } } },
			orderBy: { createdAt: "asc" },
			take,
		});
		return admins.map((m) => ({
			memberId: m.id,
			firstName: m.firstName,
			lastName: m.lastName,
			displayName: m.user?.displayName ?? null,
			photoUrl: m.user?.photoUrl ?? null,
		}));
	}

	// Every active membership for a given user, joined to tenant for the
	// display name + slug. Used by super-admin user-management.
	async findAllForUserWithTenants(
		userId: string,
	): Promise<MemberWithTenantInfo[]> {
		const rows = await this.prisma.member.findMany({
			where: { userId },
			include: { tenant: { select: { id: true, slug: true, name: true } } },
			orderBy: { createdAt: "asc" },
		});
		return rows.map((m) => ({
			memberId: m.id,
			role: m.role,
			tenantId: m.tenant.id,
			tenantSlug: m.tenant.slug,
			tenantName: m.tenant.name,
			createdAt: m.createdAt,
		}));
	}

	async softDelete(
		tenantId: string,
		id: string,
		actorId: string | null,
	): Promise<Member> {
		return this.prisma.$transaction(async (tx) => {
			await softDelete(tx, "Member", {
				where: { id, tenantId },
				actorId,
			});
			return tx.member.findFirstOrThrow(
				withDeleted("Member", { where: { id, tenantId } }),
			);
		});
	}

	async restore(tenantId: string, id: string): Promise<Member> {
		return this.prisma.$transaction(async (tx) => {
			await restore(tx, "Member", { where: { id, tenantId } });
			return tx.member.findFirstOrThrow({ where: { id, tenantId } });
		});
	}
}
