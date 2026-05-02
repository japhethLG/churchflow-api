import {
	AuthUser,
	TenantContext,
} from "@infrastructure/firebase-auth/types/auth-user.type";
import { UserClaimsService } from "@infrastructure/firebase-auth/user-claims.service";
import { AuditService } from "@modules/core/audit/services/audit.service";
import { MemberListResult } from "@modules/core/member/repository/member.repository";
import { MemberService } from "@modules/core/member/services/member.service";
import { UserService } from "@modules/core/user/services/user.service";
import {
	MemberMergingService,
	MergePreview,
	MergeResult,
} from "@modules/processes/member-merging/services/member-merging.service";
import { Injectable, NotFoundException } from "@nestjs/common";
import { AuditAction, type Member } from "@prisma/client";

import {
	CreateMemberRequestDto,
	MemberFiltersRequestDto,
	UpdateMemberRequestDto,
	UpdateMyMembershipRequestDto,
} from "../dto/member.request.dto";

@Injectable()
export class MemberFeatureService {
	constructor(
		private readonly memberService: MemberService,
		private readonly userService: UserService,
		private readonly userClaims: UserClaimsService,
		private readonly auditService: AuditService,
		private readonly memberMerging: MemberMergingService,
	) {}

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
		return this.memberMerging.merge({
			tenantId: tenant.tenantId,
			keepId,
			dropId,
			actorUid: user.firebaseUid,
			actorEmail: user.email,
		});
	}

	async create(
		user: AuthUser,
		tenant: TenantContext,
		data: CreateMemberRequestDto,
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
		filters: MemberFiltersRequestDto,
	): Promise<MemberListResult> {
		return this.memberService.getAll(tenant.tenantId, filters);
	}

	// Returns the currently-authenticated user's member row in this tenant.
	// Used by member-role UIs that need "who am I in this church".
	async getMe(tenant: TenantContext): Promise<Member> {
		if (!tenant.memberId) {
			throw new NotFoundException(
				"No member row for current user in this tenant",
			);
		}
		return this.memberService.getById(tenant.tenantId, tenant.memberId);
	}

	async updateMe(
		user: AuthUser,
		tenant: TenantContext,
		data: UpdateMyMembershipRequestDto,
	): Promise<Member> {
		if (!tenant.memberId) {
			throw new NotFoundException(
				"No member row for current user in this tenant",
			);
		}
		const before = await this.memberService.getById(
			tenant.tenantId,
			tenant.memberId,
		);
		const member = await this.memberService.update(
			tenant.tenantId,
			tenant.memberId,
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

	async getById(tenant: TenantContext, id: string): Promise<Member> {
		return this.memberService.getById(tenant.tenantId, id);
	}

	async update(
		user: AuthUser,
		tenant: TenantContext,
		id: string,
		data: UpdateMemberRequestDto,
	): Promise<Member> {
		const before = await this.memberService.getById(tenant.tenantId, id);
		const member = await this.memberService.update(tenant.tenantId, id, data);

		// If role changed and this member is linked to a user, refresh their
		// claims so the change takes effect on next token refresh.
		if (data.role && data.role !== before.role && member.userId) {
			const linkedUser = await this.userService.findById(member.userId);
			if (linkedUser) await this.userClaims.refreshFor(linkedUser.firebaseUid);
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

	async delete(
		user: AuthUser,
		tenant: TenantContext,
		id: string,
	): Promise<Member> {
		const member = await this.memberService.delete(tenant.tenantId, id);

		// Remove the tenant from the user's claims if they were linked.
		if (member.userId) {
			const linkedUser = await this.userService.findById(member.userId);
			if (linkedUser) await this.userClaims.refreshFor(linkedUser.firebaseUid);
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
}
