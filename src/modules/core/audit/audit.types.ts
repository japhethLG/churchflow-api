import type { AuditAction } from '@prisma/client';

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
  offset?: number;
  limit?: number;
}
