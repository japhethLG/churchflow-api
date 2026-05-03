import {
	AuthUser,
	TenantContext,
} from "@infrastructure/firebase-auth/types/auth-user.type";
import {
	CallHandler,
	ExecutionContext,
	Injectable,
	NestInterceptor,
} from "@nestjs/common";
import { Request } from "express";
import { Observable } from "rxjs";

import { AbilityFactory } from "./ability.factory";
import { AppAbility } from "./ability.types";

// Builds the request-scoped CASL ability after TenantGuard has populated
// `req.tenant` and stores it on the request so @CurrentAbility() and
// PolicyGuard can read it without re-resolving.
//
// Registered as a global APP_INTERCEPTOR in MainModule so it runs on every
// authenticated request without per-controller wiring.
@Injectable()
export class AbilityInterceptor implements NestInterceptor {
	constructor(private readonly factory: AbilityFactory) {}

	intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
		const req = ctx.switchToHttp().getRequest<
			Request & {
				ability?: AppAbility;
				tenant?: TenantContext;
				user?: AuthUser;
			}
		>();

		if (!req.ability) {
			req.ability = this.resolveAbility(req.tenant, req.user);
		}

		return next.handle();
	}

	private resolveAbility(
		tenant: TenantContext | undefined,
		user: AuthUser | undefined,
	): AppAbility {
		if (tenant) return this.factory.createForTenant(tenant);

		// No tenant context — platform routes / pre-tenant flows.
		if (user?.isSuperAdmin) {
			return this.factory.createForTenant({ tenantId: "", slug: "" });
		}

		// Default: deny-all ability.
		return this.factory.createForTenant({
			tenantId: "",
			slug: "",
			role: "USER",
		});
	}
}
