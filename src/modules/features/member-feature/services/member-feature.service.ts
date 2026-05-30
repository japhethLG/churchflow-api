import {
	AuthUser,
	TenantContext,
} from "@infrastructure/firebase-auth/types/auth-user.type";
import { UserClaimsService } from "@infrastructure/firebase-auth/user-claims.service";
import { AuditService } from "@modules/core/audit/services/audit.service";
import { MemberListResult } from "@modules/core/member/repository/member.repository";
import { MemberService } from "@modules/core/member/services/member.service";
import { PledgeService } from "@modules/core/pledge/services/pledge.service";
import { GivingTrendResult } from "@modules/core/transaction/repository/transaction.repository";
import { TransactionService } from "@modules/core/transaction/services/transaction.service";
import { UserService } from "@modules/core/user/services/user.service";
import {
	MemberMergingService,
	MergePreview,
	MergeResult,
} from "@modules/processes/member-merging/services/member-merging.service";
import { Injectable } from "@nestjs/common";
import {
	AuditAction,
	type Member,
	type MemberRole,
	type MemberStatus,
} from "@prisma/client";
import dayjs from "@shared/dayjs";

// Internal create input. Authorization is the controller's
// responsibility; the service trusts pre-authorized inputs.
export interface CreateMemberServiceInput {
	firstName: string;
	lastName: string;
	email?: string;
	phone?: string;
	address?: string;
	role?: MemberRole;
}

// Admin-update input — admins may change role and status.
export interface UpdateMemberServiceInput {
	firstName?: string;
	lastName?: string;
	email?: string;
	phone?: string;
	address?: string;
	role?: MemberRole;
	status?: MemberStatus;
}

// Self-update input — only mutable contact fields. Role/status/email are
// not exposed.
export interface UpdateMyProfileServiceInput {
	firstName?: string;
	lastName?: string;
	phone?: string;
	address?: string;
}

// Unified member feature service. Authorization (role gating, ownership)
// is the controller's responsibility — see member.tenant.controller and
// member.self.controller. The service focuses on persistence + audit.
// Aggregate snapshot for the admin Member Detail page. Combines
// transaction totals + pledge totals into one response so the FE does
// not have to re-implement aggregation against paginated lists.
export interface MemberSummaryResult {
	lifetimeGiving: number;
	transactionCount: number;
	avgGift: number;
	firstGiftDate: string | null;
	lastGiftDate: string | null;
	activePledgesCount: number;
	fulfilledPledgesCount: number;
	cancelledPledgesCount: number;
	pledgedTotal: number;
	paidTotal: number;
	pledgeFulfillmentPct: number;
}

@Injectable()
export class MemberFeatureService {
	constructor(
		private readonly memberService: MemberService,
		private readonly userService: UserService,
		private readonly userClaims: UserClaimsService,
		private readonly auditService: AuditService,
		private readonly memberMerging: MemberMergingService,
		private readonly transactionService: TransactionService,
		private readonly pledgeService: PledgeService,
	) {}

	// Lifetime giving + pledge stats for one member. Both halves are
	// SQL-side aggregations — transaction summary uses the uncapped
	// /transactions/summary path, pledge stats use a single groupBy by
	// status on the denormalized paidAmount/pledgedAmount columns.
	async summary(
		tenant: TenantContext,
		memberId: string,
	): Promise<MemberSummaryResult> {
		// Confirm the member exists in this tenant (throws 404 otherwise).
		await this.memberService.getById(tenant.tenantId, memberId);

		const RANGE_FLOOR = new Date(Date.UTC(1970, 0, 1));
		const RANGE_CEILING = new Date(Date.UTC(2999, 11, 31, 23, 59, 59, 999));

		const [txSummary, pledgeStats] = await Promise.all([
			this.transactionService.summary(
				tenant.tenantId,
				RANGE_FLOOR,
				RANGE_CEILING,
				// Reads only lifetime scalars — skip the monthly series so the
				// 1970→2999 window stays a single query, not one per month.
				{ memberId, withMonthly: false },
			),
			this.pledgeService.getStatsForMember(tenant.tenantId, memberId),
		]);

		return {
			lifetimeGiving: txSummary.total,
			transactionCount: txSummary.count,
			avgGift: txSummary.avg,
			firstGiftDate: txSummary.firstDate,
			lastGiftDate: txSummary.lastDate,
			activePledgesCount: pledgeStats.activePledgesCount,
			fulfilledPledgesCount: pledgeStats.fulfilledPledgesCount,
			cancelledPledgesCount: pledgeStats.cancelledPledgesCount,
			pledgedTotal: pledgeStats.pledgedTotal,
			paidTotal: pledgeStats.paidTotal,
			pledgeFulfillmentPct:
				pledgeStats.pledgedTotal > 0
					? pledgeStats.paidTotal / pledgeStats.pledgedTotal
					: 0,
		};
	}

	// Per-member monthly giving series for the members-list sparklines.
	// Scoped to the member ids the page is showing and a rolling window of
	// `months` (clamped 1..24), so a single server-side aggregate replaces
	// the FE's fetch-500-transactions-and-bucket-in-JS over-fetch.
	async givingTrend(
		tenant: TenantContext,
		options: { memberIds: string[]; months: number },
	): Promise<GivingTrendResult> {
		const window = Math.max(1, Math.min(options.months, 24));
		const now = dayjs.utc();
		const dateTo = now.endOf("month").toDate();
		const dateFrom = now
			.subtract(window - 1, "month")
			.startOf("month")
			.toDate();
		return this.transactionService.givingTrendByMember(
			tenant.tenantId,
			options.memberIds,
			dateFrom,
			dateTo,
		);
	}

	async previewMerge(
		tenant: TenantContext,
		keepId: string,
		dropId: string,
	): Promise<MergePreview> {
		return this.memberMerging.preview({
			tenantId: tenant.tenantId,
			keepId,
			dropId,
		});
	}

	async merge(
		user: AuthUser,
		tenant: TenantContext,
		keepId: string,
		dropId: string,
	): Promise<MergeResult> {
		const actor = await this.userService.findByFirebaseUid(user.firebaseUid);
		return this.memberMerging.merge({
			tenantId: tenant.tenantId,
			keepId,
			dropId,
			actorUid: user.firebaseUid,
			actorId: actor?.id ?? null,
			actorEmail: user.email,
		});
	}

	async create(
		user: AuthUser,
		tenant: TenantContext,
		data: CreateMemberServiceInput,
	): Promise<Member> {
		const member = await this.memberService.create({
			tenantId: tenant.tenantId,
			createdBy: user.firebaseUid,
			firstName: data.firstName,
			lastName: data.lastName,
			email: data.email,
			phone: data.phone,
			address: data.address,
			role: data.role,
		});
		await this.auditService.record({
			tenantId: tenant.tenantId,
			actorUid: user.firebaseUid,
			actorEmail: user.email,
			action: AuditAction.CREATE,
			entity: "Member",
			entityId: member.id,
			summary: `Created member ${member.firstName} ${member.lastName}`,
		});
		return member;
	}

	async list(
		tenant: TenantContext,
		filters: {
			status?: MemberStatus;
			search?: string;
			dateFrom?: Date;
			dateTo?: Date;
			offset?: number;
			limit?: number;
			includeDeleted?: boolean;
			onlyDeleted?: boolean;
		},
	): Promise<MemberListResult> {
		return this.memberService.getAll(tenant.tenantId, filters);
	}

	// Generic single-member fetch by id. Used by both tenant (admin) and
	// self (caller's own row) controllers — they enforce authorization
	// through CASL after the row is loaded.
	async getMember(tenant: TenantContext, memberId: string): Promise<Member> {
		return this.memberService.getById(tenant.tenantId, memberId);
	}

	async getById(
		tenant: TenantContext,
		id: string,
		options: { includeDeleted?: boolean } = {},
	): Promise<Member> {
		return options.includeDeleted
			? this.memberService.getByIdIncludingDeleted(tenant.tenantId, id)
			: this.memberService.getById(tenant.tenantId, id);
	}

	async update(
		user: AuthUser,
		tenant: TenantContext,
		id: string,
		data: UpdateMemberServiceInput,
	): Promise<Member> {
		const before = await this.memberService.getById(tenant.tenantId, id);
		const member = await this.memberService.update(tenant.tenantId, id, data);

		// If role changed and this member is linked to a user, refresh their
		// claims so the change takes effect on next token refresh.
		if (data.role && data.role !== before.role && member.userId) {
			const linkedUser = await this.userService.findById(member.userId);
			if (linkedUser) {
				await this.userClaims.refreshFor(linkedUser.firebaseUid);
			}
			await this.auditService.record({
				tenantId: tenant.tenantId,
				actorUid: user.firebaseUid,
				actorEmail: user.email,
				action: AuditAction.ROLE_CHANGE,
				entity: "Member",
				entityId: member.id,
				summary: `Role ${before.role} → ${data.role}`,
			});
		} else {
			await this.auditService.record({
				tenantId: tenant.tenantId,
				actorUid: user.firebaseUid,
				actorEmail: user.email,
				action: AuditAction.UPDATE,
				entity: "Member",
				entityId: member.id,
				diff: { before, after: data },
			});
		}

		return member;
	}

	// Self-service profile update. Restricted to a fixed set of fields;
	// role and status cannot be changed here.
	async updateProfile(
		user: AuthUser,
		tenant: TenantContext,
		memberId: string,
		data: UpdateMyProfileServiceInput,
	): Promise<Member> {
		const before = await this.memberService.getById(tenant.tenantId, memberId);
		const member = await this.memberService.update(
			tenant.tenantId,
			memberId,
			data,
		);
		await this.auditService.record({
			tenantId: tenant.tenantId,
			actorUid: user.firebaseUid,
			actorEmail: user.email,
			action: AuditAction.UPDATE,
			entity: "Member",
			entityId: member.id,
			summary: "Self-updated profile",
			diff: { before, after: data },
		});
		return member;
	}

	async delete(
		user: AuthUser,
		tenant: TenantContext,
		id: string,
	): Promise<Member> {
		const actor = await this.userService.findByFirebaseUid(user.firebaseUid);
		const member = await this.memberService.delete(
			tenant.tenantId,
			id,
			actor?.id ?? null,
		);

		// Remove the tenant from the user's claims if they were linked.
		if (member.userId) {
			const linkedUser = await this.userService.findById(member.userId);
			if (linkedUser) {
				await this.userClaims.refreshFor(linkedUser.firebaseUid);
			}
		}

		await this.auditService.record({
			tenantId: tenant.tenantId,
			actorUid: user.firebaseUid,
			actorEmail: user.email,
			action: AuditAction.DELETE,
			entity: "Member",
			entityId: member.id,
		});
		return member;
	}

	async restore(
		user: AuthUser,
		tenant: TenantContext,
		id: string,
	): Promise<Member> {
		const member = await this.memberService.restore(tenant.tenantId, id);

		// If the restored member is linked to a user, refresh their claims so
		// the membership reappears in `tenantMemberships` on next token use.
		if (member.userId) {
			const linkedUser = await this.userService.findById(member.userId);
			if (linkedUser) {
				await this.userClaims.refreshFor(linkedUser.firebaseUid);
			}
		}

		await this.auditService.record({
			tenantId: tenant.tenantId,
			actorUid: user.firebaseUid,
			actorEmail: user.email,
			action: AuditAction.RESTORE,
			entity: "Member",
			entityId: member.id,
		});
		return member;
	}
}
