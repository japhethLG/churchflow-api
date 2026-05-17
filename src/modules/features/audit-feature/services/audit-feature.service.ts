import { AuditEventFilters } from "@modules/core/audit/audit.types";
import { AuditService } from "@modules/core/audit/services/audit.service";
import { Injectable } from "@nestjs/common";
import { AuditEvent } from "@prisma/client";

export interface AuditEventListResult {
	items: AuditEvent[];
	total: number;
}

@Injectable()
export class AuditFeatureService {
	constructor(private readonly auditService: AuditService) {}

	async list(filters: AuditEventFilters): Promise<AuditEventListResult> {
		return this.auditService.list(filters);
	}
}
