import {
	AuthUser,
	TenantContext,
} from "@infrastructure/firebase-auth/types/auth-user.type";
import {
	CanActivate,
	ExecutionContext,
	Injectable,
	SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Request } from "express";

import { AbilityFactory } from "./ability.factory";
import { Actions, AppAbility } from "./ability.types";
import { assertCan, type SubjectName } from "./assert-can";

const POLICY_KEY = "policy:rules";

export interface PolicyRule {
	action: Actions;
	subject: SubjectName;
}

// Class- or handler-level coarse policy check.
//
// Use this for endpoints that are gated on subject-type alone (e.g. "this
// route requires `manage Tenant`"). Resource-level checks (where the row
// matters) should go inside the service via `assertCan(ability, action,
// asSubject(...))`.
//
// Example:
//   @CheckPolicy({ action: "manage", subject: "Member" })
//   @Get()
//   list() { ... }
export const CheckPolicy = (...rules: PolicyRule[]) =>
	SetMetadata(POLICY_KEY, rules);

@Injectable()
export class PolicyGuard implements CanActivate {
	constructor(
		private readonly reflector: Reflector,
		private readonly abilityFactory: AbilityFactory,
	) {}

	canActivate(ctx: ExecutionContext): boolean {
		const rules = this.reflector.getAllAndOverride<PolicyRule[] | undefined>(
			POLICY_KEY,
			[ctx.getHandler(), ctx.getClass()],
		);
		if (!rules || rules.length === 0) {
			return true;
		}

		const req = ctx.switchToHttp().getRequest<
			Request & {
				tenant?: TenantContext;
				user?: AuthUser;
				ability?: AppAbility;
			}
		>();

		const ability =
			req.ability ??
			(req.tenant
				? this.abilityFactory.createForTenant(req.tenant)
				: this.abilityFactory.createForTenant({
						tenantId: "",
						slug: "",
						role: req.user?.isSuperAdmin ? undefined : "USER",
					}));

		// Cache on the request so handlers / @CurrentAbility skip recomputation.
		req.ability = ability;

		for (const rule of rules) {
			assertCan(ability, rule.action, rule.subject);
		}
		return true;
	}
}
