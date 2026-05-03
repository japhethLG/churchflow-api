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
import { Injectable } from "@nestjs/common";
import {
	AuditAction,
	type Member,
	type MemberRole,
	type MemberStatus,
} from "@prisma/client";

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
			offset?: number;
			limit?: number;
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

	async getById(tenant: TenantContext, id: string): Promise<Member> {
		return this.memberService.getById(tenant.tenantId, id);
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
