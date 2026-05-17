import { InvitationStatus, MemberRole } from "@prisma/client";

export interface CreateInvitationInput {
	tenantId: string;
	email: string;
	role: MemberRole;
	invitedBy: string;
	token: string;
	expiresAt: Date;
	memberId?: string | null;
}

export interface InvitationFilters {
	status?: InvitationStatus;
	role?: MemberRole;
	search?: string;
	// `dateFrom`/`dateTo` bracket `createdAt` (inclusive, ISO 8601 UTC).
	dateFrom?: Date;
	dateTo?: Date;
	offset?: number;
	limit?: number;
}
