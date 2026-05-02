import type { MemberRole } from "@prisma/client";

export interface CreateInvitationInput {
	tenantId: string;
	email: string;
	role: MemberRole;
	invitedBy: string;
	token: string;
	expiresAt: Date;
	memberId?: string | null;
}
