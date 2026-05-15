import { PrismaClientService } from "@infrastructure/prisma-client/prisma-client.service";
import { Injectable } from "@nestjs/common";
import { type Invitation, InvitationStatus } from "@prisma/client";
import dayjs from "@shared/dayjs";

import { CreateInvitationInput } from "../invitation.types";

@Injectable()
export class InvitationRepository {
	constructor(private readonly prisma: PrismaClientService) {}

	async create(data: CreateInvitationInput): Promise<Invitation> {
		return this.prisma.invitation.create({ data });
	}

	async findByToken(token: string): Promise<Invitation | null> {
		return this.prisma.invitation.findFirst({
			where: { token },
		});
	}

	async findById(id: string): Promise<Invitation | null> {
		return this.prisma.invitation.findFirst({ where: { id } });
	}

	async findPendingByEmail(email: string): Promise<Invitation[]> {
		return this.prisma.invitation.findMany({
			where: { email, status: InvitationStatus.PENDING },
		});
	}

	async findPendingForTenant(tenantId: string): Promise<Invitation[]> {
		return this.prisma.invitation.findMany({
			where: { tenantId, status: InvitationStatus.PENDING },
			orderBy: { createdAt: "desc" },
		});
	}

	// Used for rate-limiting: how many invitations has this tenant issued in
	// the last `windowMs` milliseconds?
	async countRecentForTenant(
		tenantId: string,
		windowMs: number,
	): Promise<number> {
		const since = dayjs().subtract(windowMs, "millisecond").toDate();
		return this.prisma.invitation.count({
			where: { tenantId, createdAt: { gte: since } },
		});
	}

	async findPendingByTenantAndEmail(
		tenantId: string,
		email: string,
	): Promise<Invitation | null> {
		return this.prisma.invitation.findFirst({
			where: {
				tenantId,
				email,
				status: InvitationStatus.PENDING,
			},
		});
	}

	async markAccepted(id: string): Promise<Invitation> {
		return this.prisma.invitation.update({
			where: { id },
			data: { status: InvitationStatus.ACCEPTED, acceptedAt: dayjs().toDate() },
		});
	}

	async markExpired(id: string): Promise<Invitation> {
		return this.prisma.invitation.update({
			where: { id },
			data: { status: InvitationStatus.EXPIRED },
		});
	}

	async markCancelled(id: string): Promise<Invitation> {
		return this.prisma.invitation.update({
			where: { id },
			data: { status: InvitationStatus.CANCELLED },
		});
	}
}
