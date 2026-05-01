import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';

import { AuditAction, type Transaction } from '@prisma/client';

import type {
  AuthUser,
  TenantContext,
} from '@infrastructure/firebase-auth/types/auth-user.type';

import { AuditService } from '@modules/core/audit/services/audit.service';
import { CampaignItemService } from '@modules/core/campaign-item/services/campaign-item.service';
import { CampaignService } from '@modules/core/campaign/services/campaign.service';
import { MemberService } from '@modules/core/member/services/member.service';
import { PledgeService } from '@modules/core/pledge/services/pledge.service';
import type {
  TransactionListResult,
  TransactionSummaryResult,
} from '@modules/core/transaction/repository/transaction.repository';
import { TransactionService } from '@modules/core/transaction/services/transaction.service';
import type { TransactionFilters } from '@modules/core/transaction/transaction.types';

import type {
  CreateTransactionRequestDto,
  TransactionFiltersRequestDto,
  UpdateTransactionRequestDto,
} from '../dto/transaction.request.dto';

@Injectable()
export class TransactionFeatureService {
  constructor(
    private readonly transactionService: TransactionService,
    private readonly memberService: MemberService,
    private readonly campaignService: CampaignService,
    private readonly campaignItemService: CampaignItemService,
    private readonly pledgeService: PledgeService,
    private readonly auditService: AuditService,
  ) {}

  async record(
    user: AuthUser,
    tenant: TenantContext,
    data: CreateTransactionRequestDto,
  ): Promise<Transaction> {
    if (data.memberId) {
      await this.memberService.getById(tenant.tenantId, data.memberId);
    }

    const resolved = await this.resolveAttribution(tenant.tenantId, data);

    const tx = await this.transactionService.create({
      ...data,
      ...resolved,
      tenantId: tenant.tenantId,
      createdBy: user.firebaseUid,
    });
    await this.auditService.record({
      tenantId: tenant.tenantId,
      actorUid: user.firebaseUid,
      actorEmail: user.email,
      action: AuditAction.CREATE,
      entity: 'Transaction',
      entityId: tx.id,
      summary: `Recorded ${Number(tx.amount)} (${tx.type})`,
    });
    return tx;
  }

  async list(
    tenant: TenantContext,
    filters: TransactionFiltersRequestDto,
  ): Promise<TransactionListResult> {
    const effective: TransactionFilters = { ...filters };
    this.ensureMemberVisibility(tenant, effective);
    return this.transactionService.getAll(tenant.tenantId, effective);
  }

  async getById(tenant: TenantContext, id: string): Promise<Transaction> {
    const tx = await this.transactionService.getById(tenant.tenantId, id);

    if (tenant.role === 'USER' && tx.memberId && tx.memberId !== tenant.memberId) {
      throw new ForbiddenException('Cannot access another member’s transaction');
    }

    return tx;
  }

  async update(
    user: AuthUser,
    tenant: TenantContext,
    id: string,
    data: UpdateTransactionRequestDto,
  ): Promise<Transaction> {
    const resolved = await this.resolveAttribution(tenant.tenantId, data);
    const tx = await this.transactionService.update(tenant.tenantId, id, {
      ...data,
      ...resolved,
    });
    await this.auditService.record({
      tenantId: tenant.tenantId,
      actorUid: user.firebaseUid,
      actorEmail: user.email,
      action: AuditAction.UPDATE,
      entity: 'Transaction',
      entityId: tx.id,
      diff: { after: data },
    });
    return tx;
  }

  async delete(
    user: AuthUser,
    tenant: TenantContext,
    id: string,
  ): Promise<Transaction> {
    const tx = await this.transactionService.delete(tenant.tenantId, id);
    await this.auditService.record({
      tenantId: tenant.tenantId,
      actorUid: user.firebaseUid,
      actorEmail: user.email,
      action: AuditAction.DELETE,
      entity: 'Transaction',
      entityId: tx.id,
    });
    return tx;
  }

  // Aggregates for the admin dashboard. `months` defaults to 12 — the
  // rolling window ends today (UTC) and starts N months back at the
  // beginning of that month so the first bucket is always full.
  async summary(
    tenant: TenantContext,
    months?: number,
  ): Promise<TransactionSummaryResult> {
    const window = Math.max(1, Math.min(months ?? 12, 60));
    const now = new Date();
    const dateTo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));
    const dateFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - window + 1, 1));

    return this.transactionService.summary(tenant.tenantId, dateFrom, dateTo);
  }

  // Validates + normalizes campaignId / campaignItemId / pledgeId so that:
  //   - If pledgeId is set, campaignId and campaignItemId match the pledge.
  //   - If campaignItemId is set, it belongs to campaignId.
  // Missing attribution fields stay undefined (not null) so PartialType
  // update semantics keep working.
  private async resolveAttribution(
    tenantId: string,
    data: {
      campaignId?: string;
      campaignItemId?: string;
      pledgeId?: string;
    },
  ): Promise<{
    campaignId?: string;
    campaignItemId?: string | null;
    pledgeId?: string;
  }> {
    if (data.pledgeId) {
      const pledge = await this.pledgeService.getById(tenantId, data.pledgeId);
      if (data.campaignId && data.campaignId !== pledge.campaignId) {
        throw new BadRequestException("campaignId doesn't match pledge.campaignId");
      }
      if (
        data.campaignItemId &&
        pledge.campaignItemId &&
        data.campaignItemId !== pledge.campaignItemId
      ) {
        throw new BadRequestException("campaignItemId doesn't match pledge.campaignItemId");
      }
      return {
        pledgeId: pledge.id,
        campaignId: pledge.campaignId,
        campaignItemId: pledge.campaignItemId,
      };
    }

    if (data.campaignItemId) {
      if (!data.campaignId) {
        throw new BadRequestException('campaignId is required when campaignItemId is set');
      }
      const item = await this.campaignItemService.getById(tenantId, data.campaignItemId);
      if (item.campaignId !== data.campaignId) {
        throw new BadRequestException('campaignItemId does not belong to campaignId');
      }
    }

    if (data.campaignId) {
      await this.campaignService.getById(tenantId, data.campaignId);
    }

    return {
      campaignId: data.campaignId,
      campaignItemId: data.campaignItemId,
    };
  }

  // Regular members can only see their own transactions. Admins (and
  // super-admins, who have no tenant role) see everything.
  private ensureMemberVisibility(
    tenant: TenantContext,
    filters: TransactionFilters,
  ): void {
    if (!tenant.role) return; // super-admin passing through
    if (tenant.role === 'ADMIN') return;
    // USER — force memberId scope.
    filters.memberId = tenant.memberId;
  }
}
