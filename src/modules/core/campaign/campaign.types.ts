import { CampaignStatus } from "@prisma/client";

export interface CreateCampaignInput {
	tenantId: string;
	createdBy: string;
	title: string;
	description?: string | null;
	deadline?: Date | null;
	status?: CampaignStatus;
}

export interface UpdateCampaignInput {
	title?: string;
	description?: string | null;
	deadline?: Date | null;
	status?: CampaignStatus;
}

export interface CampaignFilters {
	status?: CampaignStatus;
	// `dateFrom`/`dateTo` bracket `createdAt` (inclusive, ISO 8601 UTC).
	dateFrom?: Date;
	dateTo?: Date;
	offset?: number;
	limit?: number;
	// 3-state archive filter:
	//   - both flags false (or absent) → active only (default)
	//   - includeDeleted: true → active + tombstones
	//   - onlyDeleted: true → tombstones only (takes precedence)
	includeDeleted?: boolean;
	onlyDeleted?: boolean;
}
