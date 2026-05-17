import { PrismaClientService } from "@infrastructure/prisma-client/prisma-client.service";
import { applyStateFilter } from "@infrastructure/prisma-client/soft-delete";
import { Injectable } from "@nestjs/common";
import { MemberRole, User } from "@prisma/client";

import { CreateUserInput, UpdateUserInput } from "../user.types";

export interface UserWithMembership {
	user: User;
	memberships: Array<{
		memberId: string;
		role: MemberRole;
		tenantId: string;
		tenantSlug: string;
		tenantName: string;
	}>;
}

export interface UserListFilters {
	search?: string;
	tenantId?: string;
	superAdminOnly?: boolean;
	skip?: number;
	take?: number;
	includeDeleted?: boolean;
	onlyDeleted?: boolean;
}

export interface UserListWithMembershipsResult {
	items: UserWithMembership[];
	total: number;
}

@Injectable()
export class UserRepository {
	constructor(private readonly prisma: PrismaClientService) {}

	async create(data: CreateUserInput): Promise<User> {
		return this.prisma.user.create({ data });
	}

	async findById(id: string): Promise<User | null> {
		return this.prisma.user.findFirst({ where: { id } });
	}

	async findByFirebaseUid(firebaseUid: string): Promise<User | null> {
		return this.prisma.user.findFirst({
			where: { firebaseUid },
		});
	}

	async findByEmail(email: string): Promise<User | null> {
		return this.prisma.user.findFirst({ where: { email } });
	}

	async update(id: string, data: UpdateUserInput): Promise<User> {
		return this.prisma.user.update({ where: { id }, data });
	}

	async countSuperAdmins(): Promise<number> {
		return this.prisma.user.count({ where: { isSuperAdmin: true } });
	}

	// Returns users with their memberships (and each membership's tenant).
	// Used by super-admin user-management UIs that need to display "who is
	// in which church" without N+1 queries.
	async findAndCountWithMemberships(
		filters: UserListFilters,
	): Promise<UserListWithMembershipsResult> {
		const take = filters.take ?? 50;
		const skip = filters.skip ?? 0;

		const where: Record<string, unknown> = {
			...(filters.superAdminOnly ? { isSuperAdmin: true } : {}),
		};

		if (filters.search) {
			where.OR = [
				{ email: { contains: filters.search, mode: "insensitive" } },
				{ displayName: { contains: filters.search, mode: "insensitive" } },
			];
		}

		if (filters.tenantId) {
			where.memberships = { some: { tenantId: filters.tenantId } };
		}

		const { where: scopedWhere, wrap } = applyStateFilter(
			"User",
			where,
			{
				includeDeleted: filters.includeDeleted,
				onlyDeleted: filters.onlyDeleted,
			},
		);

		const [users, total] = await Promise.all([
			this.prisma.user.findMany(
				wrap({
					where: scopedWhere,
					include: {
						memberships: {
							include: {
								tenant: { select: { id: true, slug: true, name: true } },
							},
						},
					},
					orderBy: { createdAt: "desc" },
					skip,
					take,
				}),
			),
			this.prisma.user.count(wrap({ where: scopedWhere })),
		]);

		const items: UserWithMembership[] = users.map((u) => ({
			user: {
				id: u.id,
				email: u.email,
				displayName: u.displayName,
				photoUrl: u.photoUrl,
				firebaseUid: u.firebaseUid,
				isSuperAdmin: u.isSuperAdmin,
				createdAt: u.createdAt,
				updatedAt: u.updatedAt,
				deletedAt: u.deletedAt,
				deletedBy: u.deletedBy,
				deletedByCascade: u.deletedByCascade,
			},
			memberships: u.memberships.map((m) => ({
				memberId: m.id,
				role: m.role,
				tenantId: m.tenant.id,
				tenantSlug: m.tenant.slug,
				tenantName: m.tenant.name,
			})),
		}));

		return { items, total };
	}
}
