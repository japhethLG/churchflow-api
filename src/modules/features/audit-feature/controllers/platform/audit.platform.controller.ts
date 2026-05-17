import {
	type AppAbility,
	assertCan,
	CurrentAbility,
} from "@infrastructure/authorization";
import { Roles } from "@infrastructure/firebase-auth/decorators/roles.decorator";
import { Controller, Get, Query } from "@nestjs/common";
import {
	ApiBearerAuth,
	ApiOkResponse,
	ApiOperation,
	ApiTags,
} from "@nestjs/swagger";

import { AuditFeatureService } from "../../services/audit-feature.service";
import { AuditEventsQueryRequestDto } from "./requests";
import { AuditEventListResponseDto, AuditEventResponseDto } from "./responses";

// Platform intent — super-admin audit log browser. Surfaces every mutating
// action across all tenants. Read-only; audit events are append-only and
// have no edit/delete API.
@ApiTags("audit (platform)")
@ApiBearerAuth("Bearer")
@Roles("SUPER_ADMIN")
@Controller("platform/audit")
export class AuditPlatformController {
	constructor(private readonly auditFeatureService: AuditFeatureService) {}

	@Get()
	@ApiOperation({
		summary: "List audit events across the platform (super-admin only)",
	})
	@ApiOkResponse({ type: AuditEventListResponseDto })
	async list(
		@CurrentAbility() ability: AppAbility,
		@Query() query: AuditEventsQueryRequestDto,
	): Promise<AuditEventListResponseDto> {
		assertCan(ability, "read", "PlatformAdmin");
		const result = await this.auditFeatureService.list(query);
		return {
			items: result.items as unknown as AuditEventResponseDto[],
			meta: {
				offset: query.offset ?? 0,
				limit: query.limit ?? result.items.length,
				total: result.total,
			},
		};
	}
}
