import type { TransactionType } from '@prisma/client';

export interface CreateTransactionInput {
  tenantId: string;
  createdBy: string;
  type: TransactionType;
  amount: number;
  date: Date;
  memberId?: string | null;
  campaignId?: string | null;
  campaignItemId?: string | null;
  pledgeId?: string | null;
  customType?: string | null;
  note?: string | null;
  referenceNumber?: string | null;
}

export interface UpdateTransactionInput {
  type?: TransactionType;
  amount?: number;
  date?: Date;
  memberId?: string | null;
  campaignId?: string | null;
  campaignItemId?: string | null;
  pledgeId?: string | null;
  customType?: string | null;
  note?: string | null;
  referenceNumber?: string | null;
}

export interface TransactionFilters {
  memberId?: string;
  campaignId?: string;
  campaignItemId?: string;
  pledgeId?: string;
  type?: TransactionType;
  dateFrom?: Date;
  dateTo?: Date;
  offset?: number;
  limit?: number;
}
