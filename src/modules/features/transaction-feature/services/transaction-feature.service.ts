import {
	AuthUser,
	TenantContext,
} from "@infrastructure/firebase-auth/types/auth-user.type";
import { AuditService } from "@modules/core/audit/services/audit.service";
import { CampaignService } from "@modules/core/campaign/services/campaign.service";
import { CampaignItemService } from "@modules/core/campaign-item/services/campaign-item.service";
import { MemberService } from "@modules/core/member/services/member.service";
import { PledgeService } from "@modules/core/pledge/services/pledge.service";
import {
	TransactionListResult,
	TransactionSummaryResult,
} from "@modules/core/transaction/repository/transaction.repository";
import { TransactionService } from "@modules/core/transaction/services/transaction.service";
import { TransactionFilters } from "@modules/core/transaction/transaction.types";
import { BadRequestException, Injectable } from "@nestjs/common";
import {
	AuditAction,
	type Transaction,
	type TransactionType,
} from "@prisma/client";
import dayjs from "@shared/dayjs";

// Internal create input — controllers translate their HTTP DTOs into this
// shape after authorization has passed.
export interface RecordTransactionServiceInput {
	type: TransactionType;
	amount: number;
	date: Date;
	memberId?: string;
	campaignId?: string;
	campaignItemId?: string;
	pledgeId?: string;
	customType?: string;
	note?: string;
	referenceNumber?: string;
}

export interface UpdateTransactionServiceInput {
	type?: TransactionType;
	amount?: number;
	date?: Date;
	memberId?: string;
	campaignId?: string;
	campaignItemId?: string;
	pledgeId?: string;
	customType?: string;
	note?: string;
	referenceNumber?: string;
}

// Unified transaction feature service. Authorization (role gating, member
// ownership) is the controller's responsibility — see the tenant and self
// controllers. The service focuses on attribution validation and audit.
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
		data: RecordTransactionServiceInput,
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
			entity: "Transaction",
			entityId: tx.id,
			summary: `Recorded ${Number(tx.amount)} (${tx.type})`,
		});
		return tx;
	}

	async list(
		tenant: TenantContext,
		filters: TransactionFilters,
	): Promise<TransactionListResult> {
		return this.transactionService.getAll(tenant.tenantId, filters);
	}

	async getById(tenant: TenantContext, id: string): Promise<Transaction> {
		return this.transactionService.getById(tenant.tenantId, id);
	}

	async update(
		user: AuthUser,
		tenant: TenantContext,
		id: string,
		data: UpdateTransactionServiceInput,
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
			entity: "Transaction",
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
			entity: "Transaction",
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
		const now = dayjs.utc();
		const dateTo = now.endOf("month").toDate();
		const dateFrom = now
			.subtract(window - 1, "month")
			.startOf("month")
			.toDate();

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
				throw new BadRequestException(
					"campaignId doesn't match pledge.campaignId",
				);
			}
			if (
				data.campaignItemId &&
				pledge.campaignItemId &&
				data.campaignItemId !== pledge.campaignItemId
			) {
				throw new BadRequestException(
					"campaignItemId doesn't match pledge.campaignItemId",
				);
			}
			return {
				pledgeId: pledge.id,
				campaignId: pledge.campaignId,
				campaignItemId: pledge.campaignItemId,
			};
		}

		if (data.campaignItemId) {
			if (!data.campaignId) {
				throw new BadRequestException(
					"campaignId is required when campaignItemId is set",
				);
			}
			const item = await this.campaignItemService.getById(
				tenantId,
				data.campaignItemId,
			);
			if (item.campaignId !== data.campaignId) {
				throw new BadRequestException(
					"campaignItemId does not belong to campaignId",
				);
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
}
