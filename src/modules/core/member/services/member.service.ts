import { Injectable, NotFoundException } from "@nestjs/common";

import { Member, MemberRole } from "@prisma/client";

import {
	CreateMemberInput,
	MemberFilters,
	UpdateMemberInput,
} from "../member.types";
import {
	MemberAdminPreview,
	MemberListResult,
	MemberRepository,
	MemberWithTenantInfo,
} from "../repository/member.repository";

@Injectable()
export class MemberService {
	constructor(private readonly memberRepository: MemberRepository) {}

	async create(data: CreateMemberInput): Promise<Member> {
		return this.memberRepository.create(data);
	}

	async getById(tenantId: string, id: string): Promise<Member> {
		const member = await this.memberRepository.findById(tenantId, id);
		if (!member) {
			throw new NotFoundException(`Member not found: ${id}`);
		}
		return member;
	}

	async getByIdIncludingDeleted(tenantId: string, id: string): Promise<Member> {
		const member = await this.memberRepository.findByIdIncludingDeleted(
			tenantId,
			id,
		);
		if (!member) {
			throw new NotFoundException(`Member not found: ${id}`);
		}
		return member;
	}

	async findByUserId(tenantId: string, userId: string): Promise<Member | null> {
		return this.memberRepository.findByUserId(tenantId, userId);
	}

	async getAll(
		tenantId: string,
		filters?: MemberFilters,
	): Promise<MemberListResult> {
		return this.memberRepository.findAll(tenantId, filters ?? {});
	}

	async update(
		tenantId: string,
		id: string,
		data: UpdateMemberInput,
	): Promise<Member> {
		await this.getById(tenantId, id);
		return this.memberRepository.update(tenantId, id, data);
	}

	async delete(
		tenantId: string,
		id: string,
		actorId: string | null,
	): Promise<Member> {
		await this.getById(tenantId, id);
		return this.memberRepository.softDelete(tenantId, id, actorId);
	}

	async restore(tenantId: string, id: string): Promise<Member> {
		await this.getByIdIncludingDeleted(tenantId, id);
		return this.memberRepository.restore(tenantId, id);
	}

	async countForTenant(
		tenantId: string,
		filters: { role?: MemberRole; createdSince?: Date } = {},
	): Promise<number> {
		return this.memberRepository.countForTenant(tenantId, filters);
	}

	async countAcrossTenants(
		filters: { role?: MemberRole; createdSince?: Date } = {},
	): Promise<number> {
		return this.memberRepository.countAcrossTenants(filters);
	}

	async getAdminsPreview(
		tenantId: string,
		take: number,
	): Promise<MemberAdminPreview[]> {
		return this.memberRepository.findAdminsPreview(tenantId, take);
	}

	async countsByTenantAndRole(
		tenantIds: string[],
	): Promise<Array<{ tenantId: string; role: MemberRole; count: number }>> {
		return this.memberRepository.countsByTenantAndRole(tenantIds);
	}

	async getAdminsPreviewForTenants(
		tenantIds: string[],
		perTenant: number,
	): Promise<Map<string, MemberAdminPreview[]>> {
		return this.memberRepository.findAdminsPreviewForTenants(
			tenantIds,
			perTenant,
		);
	}

	async getAllForUser(userId: string): Promise<MemberWithTenantInfo[]> {
		return this.memberRepository.findAllForUserWithTenants(userId);
	}

	async linkUser(
		tenantId: string,
		id: string,
		userId: string,
	): Promise<Member> {
		await this.getById(tenantId, id);
		return this.memberRepository.update(tenantId, id, { userId });
	}
}
