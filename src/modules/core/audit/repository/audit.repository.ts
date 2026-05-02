import type { PrismaClientService } from "@infrastructure/prisma-client/prisma-client.service";
import { Injectable } from "@nestjs/common";
import type { AuditEvent, Prisma } from "@prisma/client";

import type { AuditEventFilters, WriteAuditEventInput } from "../audit.types";

export interface AuditEventListResult {
	items: AuditEvent[];
	total: number;
}

@Injectable()
export class AuditRepository {
	constructor(private readonly prisma: PrismaClientService) {}

	async create(data: WriteAuditEventInput): Promise<AuditEvent> {
		return this.prisma.auditEvent.create({
			data: {
				tenantId: data.tenantId,
				actorUid: data.actorUid,
				actorEmail: data.actorEmail ?? null,
				action: data.action,
				entity: data.entity,
				entityId: data.entityId,
				summary: data.summary ?? null,
				diff: (data.diff ?? null) as Prisma.InputJsonValue,
			},
		});
	}

	async findAll(filters: AuditEventFilters): Promise<AuditEventListResult> {
		const where: Prisma.AuditEventWhereInput = {
			...(filters.tenantId ? { tenantId: filters.tenantId } : {}),
			...(filters.entity ? { entity: filters.entity } : {}),
			...(filters.entityId ? { entityId: filters.entityId } : {}),
			...(filters.actorUid ? { actorUid: filters.actorUid } : {}),
		};

		const [items, total] = await Promise.all([
			this.prisma.auditEvent.findMany({
				where,
				orderBy: { createdAt: "desc" },
				skip: filters.offset,
				take: filters.limit,
			}),
			this.prisma.auditEvent.count({ where }),
		]);

		return { items, total };
	}
}
