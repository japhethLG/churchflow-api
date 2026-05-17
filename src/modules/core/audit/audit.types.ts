import { AuditAction } from "@prisma/client";

export interface WriteAuditEventInput {
	tenantId: string | null;
	actorUid: string;
	actorEmail?: string | null;
	action: AuditAction;
	entity: string;
	entityId: string;
	summary?: string | null;
	diff?: unknown;
}

export interface AuditEventFilters {
	tenantId?: string;
	entity?: string;
	entityId?: string;
	actorUid?: string;
	action?: AuditAction;
	// `dateFrom`/`dateTo` bracket `createdAt` (inclusive, ISO 8601 UTC).
	dateFrom?: Date;
	dateTo?: Date;
	offset?: number;
	limit?: number;
}
