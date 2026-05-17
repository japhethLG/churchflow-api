import { PrismaClientService } from "@infrastructure/prisma-client/prisma-client.service";
import { Injectable } from "@nestjs/common";
import { AuditEvent, Prisma } from "@prisma/client";

import { AuditEventFilters, WriteAuditEventInput } from "../audit.types";

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
		const createdAt =
			filters.dateFrom || filters.dateTo
				? {
						...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
						...(filters.dateTo ? { lte: filters.dateTo } : {}),
					}
				: undefined;
		const where: Prisma.AuditEventWhereInput = {
			...(filters.tenantId ? { tenantId: filters.tenantId } : {}),
			...(filters.entity ? { entity: filters.entity } : {}),
			...(filters.entityId ? { entityId: filters.entityId } : {}),
			...(filters.actorUid ? { actorUid: filters.actorUid } : {}),
			...(filters.action ? { action: filters.action } : {}),
			...(createdAt ? { createdAt } : {}),
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
