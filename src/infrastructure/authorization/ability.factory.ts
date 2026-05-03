import { AbilityBuilder } from "@casl/ability";
import { createPrismaAbility } from "@casl/prisma";
import { TenantContext } from "@infrastructure/firebase-auth/types/auth-user.type";
import { Injectable } from "@nestjs/common";

import { AppAbility } from "./ability.types";

// The single source of truth for "who can do what" in this application.
//
// Rules are evaluated per-request from the TenantContext that TenantGuard
// already produces. There are NO role checks anywhere else in the codebase
// — feature services and controllers ask CASL via `ability.can(...)` or
// `assertCan(...)`. To grant or revoke a capability, edit ONLY this file.
//
// Conventions:
//   - super-admin (no tenant.role): unrestricted (`manage`/`all`).
//   - ADMIN: full management of tenant-scoped resources, except destructive
//     ops on Tenant itself which remain super-admin-only.
//   - USER: self-service access scoped to their own member row.
//
// Every USER rule MUST carry a Prisma where-style condition that pins the
// resource to `tenant.memberId` so list queries can be narrowed via the
// `accessibleBy` helper.
@Injectable()
export class AbilityFactory {
	createForTenant(tenant: TenantContext): AppAbility {
		const { can, cannot, build } = new AbilityBuilder<AppAbility>(
			createPrismaAbility,
		);

		if (!tenant.role) {
			can("manage", "all");
			return build();
		}

		if (tenant.role === "ADMIN") {
			can("manage", [
				"Member",
				"Transaction",
				"Pledge",
				"Campaign",
				"CampaignItem",
				"Invitation",
			]);
			can(["read", "update"], "Tenant");
			cannot(["delete", "create"], "Tenant");
			return build();
		}

		// tenant.role === "USER"
		const memberId = tenant.memberId;

		can("read", "Tenant");
		can("read", ["Campaign", "CampaignItem"]);

		if (memberId) {
			can(["read", "update"], "Member", { id: memberId });
			can("read", "Transaction", { memberId });
			can(["read", "create", "update"], "Pledge", { memberId });
		}

		return build();
	}
}
