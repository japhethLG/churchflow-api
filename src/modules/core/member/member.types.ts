import { MemberRole, MemberStatus } from "@prisma/client";

export interface CreateMemberInput {
	tenantId: string;
	createdBy: string;
	firstName: string;
	lastName: string;
	userId?: string | null;
	email?: string | null;
	phone?: string | null;
	address?: string | null;
	role?: MemberRole;
	status?: MemberStatus;
}

export interface UpdateMemberInput {
	firstName?: string;
	lastName?: string;
	userId?: string | null;
	email?: string | null;
	phone?: string | null;
	address?: string | null;
	role?: MemberRole;
	status?: MemberStatus;
}

export interface MemberFilters {
	status?: MemberStatus;
	search?: string;
	// dateFrom/dateTo bracket `Member.createdAt`.
	dateFrom?: Date;
	dateTo?: Date;
	offset?: number;
	limit?: number;
	// 3-state archive filter — see CampaignFilters for semantics.
	includeDeleted?: boolean;
	onlyDeleted?: boolean;
}
