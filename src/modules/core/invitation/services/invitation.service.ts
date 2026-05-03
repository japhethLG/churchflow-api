import { Injectable, NotFoundException } from "@nestjs/common";

import { Invitation } from "@prisma/client";

import { CreateInvitationInput } from "../invitation.types";
import { InvitationRepository } from "../repository/invitation.repository";

@Injectable()
export class InvitationService {
	constructor(private readonly invitationRepository: InvitationRepository) {}

	async create(data: CreateInvitationInput): Promise<Invitation> {
		return this.invitationRepository.create(data);
	}

	async getByToken(token: string): Promise<Invitation> {
		const invitation = await this.invitationRepository.findByToken(token);
		if (!invitation) {
			throw new NotFoundException("Invitation not found");
		}
		return invitation;
	}

	async getById(id: string): Promise<Invitation> {
		const invitation = await this.invitationRepository.findById(id);
		if (!invitation) {
			throw new NotFoundException("Invitation not found");
		}
		return invitation;
	}

	async findPendingByEmail(email: string): Promise<Invitation[]> {
		return this.invitationRepository.findPendingByEmail(email);
	}

	async findPendingForTenant(tenantId: string): Promise<Invitation[]> {
		return this.invitationRepository.findPendingForTenant(tenantId);
	}

	async findPendingByTenantAndEmail(
		tenantId: string,
		email: string,
	): Promise<Invitation | null> {
		return this.invitationRepository.findPendingByTenantAndEmail(
			tenantId,
			email,
		);
	}

	async countRecentForTenant(
		tenantId: string,
		windowMs: number,
	): Promise<number> {
		return this.invitationRepository.countRecentForTenant(tenantId, windowMs);
	}

	async markAccepted(id: string): Promise<Invitation> {
		return this.invitationRepository.markAccepted(id);
	}

	async markExpired(id: string): Promise<Invitation> {
		return this.invitationRepository.markExpired(id);
	}

	async markCancelled(id: string): Promise<Invitation> {
		return this.invitationRepository.markCancelled(id);
	}
}
