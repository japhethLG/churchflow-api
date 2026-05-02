import { Injectable, Logger } from "@nestjs/common";

import { AuditEvent } from "@prisma/client";

import { AuditEventFilters, WriteAuditEventInput } from "../audit.types";
import {
	AuditEventListResult,
	AuditRepository,
} from "../repository/audit.repository";

@Injectable()
export class AuditService {
	private readonly logger = new Logger(AuditService.name);

	constructor(private readonly auditRepository: AuditRepository) {}

	// Writes are best-effort — an audit failure must not break the user's
	// action. We log and swallow.
	async record(input: WriteAuditEventInput): Promise<void> {
		try {
			await this.auditRepository.create(input);
		} catch (err) {
			this.logger.error(
				`audit write failed (action=${input.action} entity=${input.entity} id=${input.entityId}): ${(err as Error).message}`,
			);
		}
	}

	async list(filters: AuditEventFilters): Promise<AuditEventListResult> {
		return this.auditRepository.findAll(filters);
	}

	// Synchronous alternative to record() for callers that want to surface
	// write failures (e.g. tests). Features should prefer record().
	async recordStrict(input: WriteAuditEventInput): Promise<AuditEvent> {
		return this.auditRepository.create(input);
	}
}
