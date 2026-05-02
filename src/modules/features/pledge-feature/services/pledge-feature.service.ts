import type {
	AuthUser,
	TenantContext,
} from "@infrastructure/firebase-auth/types/auth-user.type";
import type { AuditService } from "@modules/core/audit/services/audit.service";
import type { CampaignService } from "@modules/core/campaign/services/campaign.service";
import type { CampaignItemService } from "@modules/core/campaign-item/services/campaign-item.service";
import type { MemberService } from "@modules/core/member/services/member.service";
import type { PledgeFilters } from "@modules/core/pledge/pledge.types";
import type { PledgeListResult } from "@modules/core/pledge/repository/pledge.repository";
import type { PledgeService } from "@modules/core/pledge/services/pledge.service";
import {
	BadRequestException,
	ForbiddenException,
	Injectable,
} from "@nestjs/common";
import { AuditAction, type Pledge } from "@prisma/client";

import type {
	CreatePledgeRequestDto,
	UpdatePledgeRequestDto,
} from "../dto/pledge.request.dto";

@Injectable()
export class PledgeFeatureService {
	constructor(
		private readonly pledgeService: PledgeService,
		private readonly campaignService: CampaignService,
		private readonly campaignItemService: CampaignItemService,
		private readonly memberService: MemberService,
		private readonly auditService: AuditService,
	) {}

	async create(
		user: AuthUser,
		tenant: TenantContext,
		data: CreatePledgeRequestDto,
	): Promise<Pledge> {
		// Members can only pledge on their own behalf; admins can pledge for
		// any member in the tenant.
		const effectiveMemberId = this.resolveMemberIdForCreate(
			tenant,
			data.memberId,
		);

		await this.campaignService.getById(tenant.tenantId, data.campaignId);
		await this.memberService.getById(tenant.tenantId, effectiveMemberId);

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
			memberId: effectiveMemberId,
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
		const effective: PledgeFilters = { ...filters };
		this.ensureMemberVisibility(tenant, effective);
		return this.pledgeService.getAll(tenant.tenantId, effective);
	}

	async getById(tenant: TenantContext, id: string): Promise<Pledge> {
		const pledge = await this.pledgeService.getById(tenant.tenantId, id);
		if (tenant.role === "USER" && pledge.memberId !== tenant.memberId) {
			throw new ForbiddenException("Cannot access another member’s pledge");
		}
		return pledge;
	}

	async update(
		user: AuthUser,
		tenant: TenantContext,
		id: string,
		data: UpdatePledgeRequestDto,
	): Promise<Pledge> {
		// Members can edit the note/status/amount on their own pledge; admins
		// can edit anyone's. The feature service enforces — the core update
		// method stays unaware of roles.
		const existing = await this.pledgeService.getById(tenant.tenantId, id);
		if (tenant.role === "USER" && existing.memberId !== tenant.memberId) {
			throw new ForbiddenException("Cannot edit another member’s pledge");
		}

		// campaignId / campaignItemId / memberId are immutable after create.
		const { pledgedAmount, status, note } = data;
		const pledge = await this.pledgeService.update(tenant.tenantId, id, {
			pledgedAmount,
			status,
			note,
		});
		await this.auditService.record({
			tenantId: tenant.tenantId,
			actorUid: user.firebaseUid,
			actorEmail: user.email,
			action: AuditAction.UPDATE,
			entity: "Pledge",
			entityId: pledge.id,
			diff: { after: { pledgedAmount, status, note } },
		});
		return pledge;
	}

	async delete(
		user: AuthUser,
		tenant: TenantContext,
		id: string,
	): Promise<Pledge> {
		const pledge = await this.pledgeService.delete(tenant.tenantId, id);
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

	private resolveMemberIdForCreate(
		tenant: TenantContext,
		requested: string,
	): string {
		if (!tenant.role) {
			// Super-admin creating a pledge — they must supply memberId
			// explicitly (they don't have a member row themselves).
			return requested;
		}
		if (tenant.role === "ADMIN") return requested;
		// USER — ignore whatever they sent and force their own memberId.
		if (!tenant.memberId) {
			throw new ForbiddenException("Member context not resolved");
		}
		return tenant.memberId;
	}

	private ensureMemberVisibility(
		tenant: TenantContext,
		filters: PledgeFilters,
	): void {
		if (!tenant.role) return; // super-admin
		if (tenant.role === "ADMIN") return;
		filters.memberId = tenant.memberId;
	}
}
