import {
	AuthUser,
	TenantContext,
} from "@infrastructure/firebase-auth/types/auth-user.type";
import { WriteAuditEventInput } from "@modules/core/audit/audit.types";
import { AuditService } from "@modules/core/audit/services/audit.service";
import { CampaignService } from "@modules/core/campaign/services/campaign.service";
import { CampaignItemService } from "@modules/core/campaign-item/services/campaign-item.service";
import { MemberService } from "@modules/core/member/services/member.service";
import { PledgeService } from "@modules/core/pledge/services/pledge.service";
import {
	GiversReportResult,
	TransactionListResult,
	TransactionSummaryOptions,
	TransactionSummaryResult,
	UnattributedSummaryResult,
} from "@modules/core/transaction/repository/transaction.repository";
import { TransactionService } from "@modules/core/transaction/services/transaction.service";
import {
	CreateTransactionInput,
	TransactionFilters,
} from "@modules/core/transaction/transaction.types";
import { UserService } from "@modules/core/user/services/user.service";
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
		private readonly userService: UserService,
		private readonly auditService: AuditService,
	) {}

	async record(
		user: AuthUser,
		tenant: TenantContext,
		data: RecordTransactionServiceInput,
	): Promise<Transaction> {
		const prepared = await this.prepareRecord(user, tenant, data);
		const tx = await this.transactionService.create(prepared.createInput);
		if (tx.pledgeId) {
			await this.pledgeService.adjustPaidAmount(
				tenant.tenantId,
				tx.pledgeId,
				Number(tx.amount),
			);
		}
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

		const txs = await this.transactionService.createManyWithAudit(prepared);
		// Apply paidAmount adjustments per-pledge. Each adjust runs in its
		// own $transaction; we batch by pledgeId so multiple gifts toward
		// the same pledge collapse into a single increment.
		const deltaByPledge = new Map<string, number>();
		for (const tx of txs) {
			if (tx.pledgeId) {
				deltaByPledge.set(
					tx.pledgeId,
					(deltaByPledge.get(tx.pledgeId) ?? 0) + Number(tx.amount),
				);
			}
		}
		for (const [pledgeId, delta] of deltaByPledge) {
			await this.pledgeService.adjustPaidAmount(
				tenant.tenantId,
				pledgeId,
				delta,
			);
		}
		return txs;
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

	async getById(
		tenant: TenantContext,
		id: string,
		options: { includeDeleted?: boolean } = {},
	): Promise<Transaction> {
		return options.includeDeleted
			? this.transactionService.getByIdIncludingDeleted(tenant.tenantId, id)
			: this.transactionService.getById(tenant.tenantId, id);
	}

	async update(
		user: AuthUser,
		tenant: TenantContext,
		id: string,
		data: UpdateTransactionServiceInput,
	): Promise<Transaction> {
		const before = await this.transactionService.getById(tenant.tenantId, id);
		const resolved = await this.resolveAttribution(tenant.tenantId, data);
		const tx = await this.transactionService.update(tenant.tenantId, id, {
			...data,
			...resolved,
		});

		// Apply paidAmount deltas. Four cases:
		// 1. pledgeId unchanged + amount unchanged → no-op
		// 2. pledgeId unchanged + amount changed → delta = new - old on same pledge
		// 3. pledgeId moved (or cleared/added) → revert old, apply new
		// 4. Was null, became set → just apply new (mirror of #3 with no revert)
		const beforeAmount = Number(before.amount);
		const afterAmount = Number(tx.amount);
		if (before.pledgeId === tx.pledgeId) {
			if (before.pledgeId && beforeAmount !== afterAmount) {
				await this.pledgeService.adjustPaidAmount(
					tenant.tenantId,
					before.pledgeId,
					afterAmount - beforeAmount,
				);
			}
		} else {
			if (before.pledgeId) {
				await this.pledgeService.adjustPaidAmount(
					tenant.tenantId,
					before.pledgeId,
					-beforeAmount,
				);
			}
			if (tx.pledgeId) {
				await this.pledgeService.adjustPaidAmount(
					tenant.tenantId,
					tx.pledgeId,
					afterAmount,
				);
			}
		}

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
		const actor = await this.userService.findByFirebaseUid(user.firebaseUid);
		const tx = await this.transactionService.delete(
			tenant.tenantId,
			id,
			actor?.id ?? null,
		);
		if (tx.pledgeId) {
			await this.pledgeService.adjustPaidAmount(
				tenant.tenantId,
				tx.pledgeId,
				-Number(tx.amount),
			);
		}
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

	async restore(
		user: AuthUser,
		tenant: TenantContext,
		id: string,
	): Promise<Transaction> {
		const tx = await this.transactionService.restore(tenant.tenantId, id);
		if (tx.pledgeId) {
			await this.pledgeService.adjustPaidAmount(
				tenant.tenantId,
				tx.pledgeId,
				Number(tx.amount),
			);
		}
		await this.auditService.record({
			tenantId: tenant.tenantId,
			actorUid: user.firebaseUid,
			actorEmail: user.email,
			action: AuditAction.RESTORE,
			entity: "Transaction",
			entityId: tx.id,
		});
		return tx;
	}

	// Aggregates for the admin dashboard.
	// - If the caller passes an explicit `dateFrom` / `dateTo`, the bounds
	//   are used verbatim. Either bound may be omitted: missing `dateFrom`
	//   defaults to the start of `dateTo`'s month (or the rolling window if
	//   `dateTo` is also missing); missing `dateTo` defaults to end-of-
	//   month today.
	// - If `lifetime: true` is passed (and no explicit bounds), the call
	//   covers the full historical range — replaces FE-side sentinels.
	// - Otherwise `months` (1..60, default 12) produces a rolling window
	//   that ends today (UTC) and begins at the start of N months back so
	//   the first month bucket is always full.
	// - `memberId` is the segregation point for self-intent callers — the
	//   self controller passes `tenant.memberId`; admins leave it
	//   undefined for tenant-wide aggregates.
	async summary(
		tenant: TenantContext,
		options: {
			dateFrom?: Date;
			dateTo?: Date;
			months?: number;
			lifetime?: boolean;
		} & TransactionSummaryOptions = {},
	): Promise<TransactionSummaryResult> {
		const { dateFrom, dateTo, months, lifetime, ...rest } = options;
		const now = dayjs.utc();
		const resolvedTo =
			dateTo ?? (dateFrom ? now.endOf("month").toDate() : null);
		const resolvedFrom =
			dateFrom ?? (dateTo ? dayjs.utc(dateTo).startOf("month").toDate() : null);

		if (resolvedFrom && resolvedTo) {
			return this.transactionService.summary(
				tenant.tenantId,
				resolvedFrom,
				resolvedTo,
				rest,
			);
		}

		// Lifetime override defeats the rolling-window fallback. Used by
		// TransactionDetailPage for the "Gifts from $member · $X lifetime"
		// context strip.
		if (lifetime) {
			const lifetimeFrom = new Date(Date.UTC(1970, 0, 1));
			const lifetimeTo = new Date(Date.UTC(2999, 11, 31, 23, 59, 59, 999));
			// The lifetime strip only renders scalar totals, so skip the
			// monthly series — otherwise this unbounded window would try to
			// build a bucket for every month from 1970 to 2999.
			return this.transactionService.summary(
				tenant.tenantId,
				lifetimeFrom,
				lifetimeTo,
				{ ...rest, withMonthly: false },
			);
		}

		const window = Math.max(1, Math.min(months ?? 12, 60));
		const fallbackTo = now.endOf("month").toDate();
		const fallbackFrom = now
			.subtract(window - 1, "month")
			.startOf("month")
			.toDate();
		return this.transactionService.summary(
			tenant.tenantId,
			fallbackFrom,
			fallbackTo,
			rest,
		);
	}

	// Counts and totals of unattributed gifts for the admin dashboard's
	// callout. Both bounds default to the controller (last 7 days).
	async unattributedSummary(
		tenant: TenantContext,
		dateFrom: Date,
		dateTo: Date,
	): Promise<UnattributedSummaryResult> {
		return this.transactionService.unattributedSummary(
			tenant.tenantId,
			dateFrom,
			dateTo,
		);
	}

	// Top-N givers report for the admin Reports page (Givers tab).
	// `dateFrom`/`dateTo` are mandatory at this layer — the controller
	// applies a sensible default (last 12 months) when callers omit them.
	async giversReport(
		tenant: TenantContext,
		dateFrom: Date,
		dateTo: Date,
		limit: number,
	): Promise<GiversReportResult> {
		return this.transactionService.giversReport(
			tenant.tenantId,
			dateFrom,
			dateTo,
			limit,
		);
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
