import { Injectable, NotFoundException } from "@nestjs/common";

import type { Member } from "@prisma/client";

import type {
	CreateMemberInput,
	MemberFilters,
	UpdateMemberInput,
} from "../member.types";
import type {
	MemberListResult,
	MemberRepository,
} from "../repository/member.repository";

@Injectable()
export class MemberService {
	constructor(private readonly memberRepository: MemberRepository) {}

	async create(data: CreateMemberInput): Promise<Member> {
		return this.memberRepository.create(data);
	}

	async getById(tenantId: string, id: string): Promise<Member> {
		const member = await this.memberRepository.findById(tenantId, id);
		if (!member) throw new NotFoundException(`Member not found: ${id}`);
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

	async delete(tenantId: string, id: string): Promise<Member> {
		await this.getById(tenantId, id);
		return this.memberRepository.softDelete(tenantId, id);
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
