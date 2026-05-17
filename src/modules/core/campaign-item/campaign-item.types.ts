export interface CreateCampaignItemInput {
	tenantId: string;
	campaignId: string;
	title: string;
	description?: string | null;
	targetAmount: number;
	deadline?: Date | null;
	sortOrder?: number;
}

export interface UpdateCampaignItemInput {
	title?: string;
	description?: string | null;
	targetAmount?: number;
	deadline?: Date | null;
	sortOrder?: number;
}

export interface CampaignItemFilters {
	campaignId?: string;
	// 3-state archive filter — same semantics as CampaignFilters.
	includeDeleted?: boolean;
	onlyDeleted?: boolean;
}
