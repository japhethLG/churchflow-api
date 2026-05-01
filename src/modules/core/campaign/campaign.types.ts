import type { CampaignStatus } from '@prisma/client';

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
  offset?: number;
  limit?: number;
}
