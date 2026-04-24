import type { PledgeStatus } from '@prisma/client';

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
  offset?: number;
  limit?: number;
}
