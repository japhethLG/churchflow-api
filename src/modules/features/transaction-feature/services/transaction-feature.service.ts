import {
	AuthUser,
	TenantContext,
} from "@infrastructure/firebase-auth/types/auth-user.type";
import { PrismaClientService } from "@infrastructure/prisma-client/prisma-client.service";
import { AuditService } from "@modules/core/audit/services/audit.service";
import { WriteAuditEventInput } from "@modules/core/audit/audit.types";
import { CampaignService } from "@modules/core/campaign/services/campaign.service";
import { CampaignItemService } from "@modules/core/campaign-item/services/campaign-item.service";
import { MemberService } from "@modules/core/member/services/member.service";
import { PledgeService } from "@modules/core/pledge/services/pledge.service";
import {
	TransactionListResult,
	TransactionSummaryResult,
} from "@modules/core/transaction/repository/transaction.repository";
import { TransactionService } from "@modules/core/transaction/services/transaction.service";
import {
	CreateTransactionInput,
	TransactionFilters,
} from "@modules/core/transaction/transaction.types";
import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import {
	AuditAction,
	type Prisma,
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
	private readonly logger = new Logger(TransactionFeatureService.name);

	constructor(
		private readonly transactionService: TransactionService,
		private readonly memberService: MemberService,
		private readonly campaignService: CampaignService,
		private readonly campaignItemService: CampaignItemService,
		private readonly pledgeService: PledgeService,
		private readonly auditService: AuditService,
		private readonly prisma: PrismaClientService,
	) {}

	async record(
		user: AuthUser,
		tenant: TenantContext,
		data: RecordTransactionServiceInput,
	): Promise<Transaction> {
		const prepared = await this.prepareRecord(user, tenant, data);
		const tx = await this.transactionService.create(prepared.createInput);
		await this.auditService.record(prepared.buildAudit(tx));
		return tx;
	}

	// Atomic batch — pre-validates every row, then writes the transactions
	// AND their audit events in a single Prisma transaction so a partial
	// failure leaves the tenant's books untouched.
	async recordMany(
		user: AuthUser,
		tenant: TenantContext,
		inputs: RecordTransactionServiceInput[],
	): Promise<Transaction[]> {
		if (inputs.length === 0) {
			throw new BadRequestException("At least one gift is required");
		}

		// Validate every row up front. If any row fails, abort before any
		// write happens. The error message includes the offending index so
		// the frontend can map it back to a row.
		const prepared = await Promise.all(
			inputs.map(async (data, index) => {
				try {
					return await this.prepareRecord(user, tenant, data);
				} catch (err) {
					const reason =
						err instanceof Error ? err.message : "validation failed";
					throw new BadRequestException(`Gift #${index + 1}: ${reason}`);
				}
			}),
		);

		return this.prisma.$transaction(async (tx) => {
			const created: Transaction[] = [];
			for (const item of prepared) {
				const row = await tx.transaction.create({ data: item.createInput });
				const auditInput = item.buildAudit(row);
				try {
					await tx.auditEvent.create({
						data: {
							tenantId: auditInput.tenantId,
							actorUid: auditInput.actorUid,
							actorEmail: auditInput.actorEmail ?? null,
							action: auditInput.action,
							entity: auditInput.entity,
							entityId: auditInput.entityId,
							summary: auditInput.summary ?? null,
							diff: (auditInput.diff ?? null) as Prisma.InputJsonValue,
						},
					});
				} catch (err) {
					// Mirror AuditService.record's swallow-and-log behaviour so
					// an audit failure doesn't roll back the user's gifts.
					this.logger.error(
						`audit write failed inside bulk (entityId=${row.id}): ${(err as Error).message}`,
					);
				}
				created.push(row);
			}
			return created;
		});
	}

	// Validates a single create input and returns the create payload + a
	// closure that produces the matching audit entry once the row exists.
	// Used by both record() and recordMany().
	private async prepareRecord(
		user: AuthUser,
		tenant: TenantContext,
		data: RecordTransactionServiceInput,
	): Promise<{
		createInput: CreateTransactionInput;
		buildAudit: (tx: Transaction) => WriteAuditEventInput;
	}> {
		if (data.memberId) {
			await this.memberService.getById(tenant.tenantId, data.memberId);
		}

		const resolved = await this.resolveAttribution(tenant.tenantId, data);

		const createInput: CreateTransactionInput = {
			...data,
			...resolved,
			tenantId: tenant.tenantId,
			createdBy: user.firebaseUid,
		};

		return {
			createInput,
			buildAudit: (tx) => ({
				tenantId: tenant.tenantId,
				actorUid: user.firebaseUid,
				actorEmail: user.email,
				action: AuditAction.CREATE,
				entity: "Transaction",
				entityId: tx.id,
				summary: `Recorded ${Number(tx.amount)} (${tx.type})`,
			}),
		};
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
