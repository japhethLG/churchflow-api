import {
	type AppAbility,
	asSubject,
	assertCan,
	CurrentAbility,
} from "@infrastructure/authorization";
import { CurrentTenant } from "@infrastructure/firebase-auth/decorators/current-tenant.decorator";
import { TenantGuard } from "@infrastructure/firebase-auth/guards/tenant.guard";
import { TenantContext } from "@infrastructure/firebase-auth/types/auth-user.type";
import { Controller, Get, UseGuards } from "@nestjs/common";
import {
	ApiBearerAuth,
	ApiOkResponse,
	ApiOperation,
	ApiParam,
	ApiTags,
} from "@nestjs/swagger";

import { TenantFeatureService } from "../../services/tenant-feature.service";
import { MyChurchResponseDto } from "./responses";

// Self-service intent for tenants. Read-only — exposes the caller's
// church profile to the member. Admins viewing their own church for
// member-side context (e.g. dashboard headers) hit this endpoint, not
// the admin-management one at /tenants/:tenantId.
@ApiTags("tenants (self)")
@ApiBearerAuth("Bearer")
@ApiParam({ name: "tenantId", description: "Tenant UUID or slug" })
@UseGuards(TenantGuard)
@Controller("tenants/:tenantId/me/church")
export class TenantSelfController {
	constructor(private readonly tenantFeatureService: TenantFeatureService) {}

	@Get()
	@ApiOperation({
		summary: "Get the caller's church profile (member perspective)",
	})
	@ApiOkResponse({ type: MyChurchResponseDto })
	async getMyChurch(
		@CurrentTenant() tenant: TenantContext,
		@CurrentAbility() ability: AppAbility,
	): Promise<MyChurchResponseDto> {
		const church = await this.tenantFeatureService.getByIdOrSlug(
			tenant.tenantId,
		);
		assertCan(ability, "read", asSubject("Tenant", church));
		return church as unknown as MyChurchResponseDto;
	}
}
