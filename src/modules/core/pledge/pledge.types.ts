import { PledgeStatus } from "@prisma/client";

export interface CreatePledgeInput {
	tenantId: string;
	createdBy: string;
	campaignId: string;
	campaignItemId?: string | null;
	memberId: string;
	pledgedAmount: number;
	status?: PledgeStatus;
	note?: string | null;
}

export interface UpdatePledgeInput {
	pledgedAmount?: number;
	status?: PledgeStatus;
	note?: string | null;
}

export interface PledgeFilters {
	campaignId?: string;
	campaignItemId?: string;
	memberId?: string;
	status?: PledgeStatus;
	// `dateFrom`/`dateTo` bracket `createdAt` (inclusive, ISO 8601 UTC) —
	// the date the pledge was made. Pledge has no separate `pledgedAt`.
	dateFrom?: Date;
	dateTo?: Date;
	offset?: number;
	limit?: number;
	// 3-state archive filter — see CampaignFilters for semantics.
	includeDeleted?: boolean;
	onlyDeleted?: boolean;
}
