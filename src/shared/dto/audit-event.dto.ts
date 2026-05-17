import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { AuditAction } from "@prisma/client";
import { Expose } from "class-transformer";

import {
	DATE_UTC_EXAMPLE,
	EMAIL_EXAMPLE,
	FIREBASE_UID_EXAMPLE,
	ID_EXAMPLE,
} from "../dto-examples";

// Canonical shape of an audit event row. Append-only — there is no update
// or delete API. `tenantId` is nullable because platform-level actions
// (tenant create, super-admin toggles) are not scoped to a tenant.
export class AuditEventDto {
	@Expose()
	@ApiProperty({ example: ID_EXAMPLE })
	id!: string;

	@Expose()
	@ApiPropertyOptional({
		example: ID_EXAMPLE,
		nullable: true,
		description:
			"Tenant the action affected. Null for platform-level events (e.g. tenant create, super-admin toggles).",
	})
	tenantId!: string | null;

	@Expose()
	@ApiProperty({
		example: FIREBASE_UID_EXAMPLE,
		description: "Firebase UID of the actor who performed the action.",
	})
	actorUid!: string;

	@Expose()
	@ApiPropertyOptional({
		example: EMAIL_EXAMPLE,
		nullable: true,
		description:
			"Snapshot of the actor's email at the time of the action. May be null for legacy events.",
	})
	actorEmail!: string | null;

	@Expose()
	@ApiProperty({ enum: AuditAction, example: AuditAction.CREATE })
	action!: AuditAction;

	@Expose()
	@ApiProperty({
		example: "Campaign",
		description:
			'Entity type the action affected — e.g. "Tenant", "Member", "Campaign", "Pledge".',
	})
	entity!: string;

	@Expose()
	@ApiProperty({ example: ID_EXAMPLE })
	entityId!: string;

	@Expose()
	@ApiPropertyOptional({
		example: 'Created campaign "New Sanctuary"',
		nullable: true,
	})
	summary!: string | null;

	@Expose()
	@ApiPropertyOptional({
		nullable: true,
		description:
			"Structured diff for UPDATE actions. Shape is owner-defined (commonly `{ before, after, changed }`).",
	})
	diff!: unknown;

	@Expose()
	@ApiProperty({ example: DATE_UTC_EXAMPLE })
	createdAt!: Date;
}
