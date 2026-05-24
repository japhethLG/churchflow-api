import {
	AuthUser,
	TenantContext,
} from "@infrastructure/firebase-auth/types/auth-user.type";
import { AuditService } from "@modules/core/audit/services/audit.service";
import { CampaignService } from "@modules/core/campaign/services/campaign.service";
import { CampaignItemService } from "@modules/core/campaign-item/services/campaign-item.service";
import { MemberService } from "@modules/core/member/services/member.service";
import { PledgeFilters } from "@modules/core/pledge/pledge.types";
import {
	PledgeListResult,
	PledgesReportResult,
	PledgeWithRelations,
} from "@modules/core/pledge/repository/pledge.repository";
import { PledgeService } from "@modules/core/pledge/services/pledge.service";
import { UserService } from "@modules/core/user/services/user.service";
import { BadRequestException, Injectable } from "@nestjs/common";
import { AuditAction, type Pledge, type PledgeStatus } from "@prisma/client";

// Internal create input. Authorization (member ownership, role gating) is
// the controller's responsibility — by the time data reaches the service,
// it has already been validated against the caller's CASL ability and the
// effective memberId is final.
export interface CreatePledgeServiceInput {
	campaignId: string;
	campaignItemId?: string;
	memberId: string;
	pledgedAmount: number;
	status?: PledgeStatus;
	note?: string;
}

// Update input — campaignId / campaignItemId / memberId are immutable
// after create, so the service does not accept them.
export interface UpdatePledgeServiceInput {
	pledgedAmount?: number;
	status?: PledgeStatus;
	note?: string;
}

// Unified pledge feature service. There is no per-intent (admin / self)
// branching here — authorization happens at the controller boundary via
// CASL. The service trusts that its inputs reflect a permitted operation
// and focuses on the business logic: validating attribution, calling core
// services, recording audit entries.
@Injectable()
export class PledgeFeatureService {
	constructor(
		private readonly pledgeService: PledgeService,
		private readonly campaignService: CampaignService,
		private readonly campaignItemService: CampaignItemService,
		private readonly memberService: MemberService,
		private readonly userService: UserService,
		private readonly auditService: AuditService,
	) {}

	async create(
		user: AuthUser,
		tenant: TenantContext,
		data: CreatePledgeServiceInput,
	): Promise<Pledge> {
		await this.campaignService.getById(tenant.tenantId, data.campaignId);
		await this.memberService.getById(tenant.tenantId, data.memberId);

		if (data.campaignItemId) {
			const item = await this.campaignItemService.getById(
				tenant.tenantId,
				data.campaignItemId,
			);
			if (item.campaignId !== data.campaignId) {
				throw new BadRequestException(
					"campaignItemId does not belong to campaignId",
				);
			}
		}

		const pledge = await this.pledgeService.create({
			...data,
			tenantId: tenant.tenantId,
			createdBy: user.firebaseUid,
		});
		await this.auditService.record({
			tenantId: tenant.tenantId,
			actorUid: user.firebaseUid,
			actorEmail: user.email,
			action: AuditAction.CREATE,
			entity: "Pledge",
			entityId: pledge.id,
			summary: `Pledged ${Number(pledge.pledgedAmount)} toward campaign ${pledge.campaignId}`,
		});
		return pledge;
	}

	async list(
		tenant: TenantContext,
		filters: PledgeFilters,
	): Promise<PledgeListResult> {
		return this.pledgeService.getAll(tenant.tenantId, filters);
	}

	async urgent(
		tenant: TenantContext,
		limit: number,
	): Promise<PledgeWithRelations[]> {
		return this.pledgeService.getUrgent(tenant.tenantId, limit);
	}

	// Cohort-style report for the admin Reports → Pledge Dynamics tab.
	// Date range applies to `pledge.createdAt` (start of the commitment).
	async report(
		tenant: TenantContext,
		options: { dateFrom?: Date; dateTo?: Date } = {},
	): Promise<PledgesReportResult> {
		return this.pledgeService.getReport(tenant.tenantId, options);
	}

	async getById(
		tenant: TenantContext,
		id: string,
		options: { includeDeleted?: boolean } = {},
	): Promise<Pledge> {
		return options.includeDeleted
			? this.pledgeService.getByIdIncludingDeleted(tenant.tenantId, id)
			: this.pledgeService.getById(tenant.tenantId, id);
	}

	async update(
		user: AuthUser,
		tenant: TenantContext,
		id: string,
		data: UpdatePledgeServiceInput,
	): Promise<Pledge> {
		const pledge = await this.pledgeService.update(tenant.tenantId, id, data);
		await this.auditService.record({
			tenantId: tenant.tenantId,
			actorUid: user.firebaseUid,
			actorEmail: user.email,
			action: AuditAction.UPDATE,
			entity: "Pledge",
			entityId: pledge.id,
			diff: { after: data },
		});
		return pledge;
	}

	async delete(
		user: AuthUser,
		tenant: TenantContext,
		id: string,
	): Promise<Pledge> {
		const actor = await this.userService.findByFirebaseUid(user.firebaseUid);
		const pledge = await this.pledgeService.delete(
			tenant.tenantId,
			id,
			actor?.id ?? null,
		);
		await this.auditService.record({
			tenantId: tenant.tenantId,
			actorUid: user.firebaseUid,
			actorEmail: user.email,
			action: AuditAction.DELETE,
			entity: "Pledge",
			entityId: pledge.id,
		});
		return pledge;
	}

	async restore(
		user: AuthUser,
		tenant: TenantContext,
		id: string,
	): Promise<Pledge> {
		const pledge = await this.pledgeService.restore(tenant.tenantId, id);
		await this.auditService.record({
			tenantId: tenant.tenantId,
			actorUid: user.firebaseUid,
			actorEmail: user.email,
			action: AuditAction.RESTORE,
			entity: "Pledge",
			entityId: pledge.id,
		});
		return pledge;
	}
}
