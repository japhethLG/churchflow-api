import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import { Request } from "express";

import { AppAbility } from "./ability.types";

// Returns the request-scoped CASL ability built by AbilityInterceptor.
// Controllers and feature services should never read `tenant.role` directly
// — they consume this and call `ability.can(...)` or `assertCan(...)`.
//
// Requires AbilityInterceptor to be registered globally (it is, in
// MainModule). If the interceptor is missing the decorator throws so the
// misconfiguration is loud rather than silent.
export const CurrentAbility = createParamDecorator(
	(_data: unknown, ctx: ExecutionContext): AppAbility => {
		const req = ctx
			.switchToHttp()
			.getRequest<Request & { ability?: AppAbility }>();
		if (!req.ability) {
			throw new Error(
				"CurrentAbility used without AbilityInterceptor — register AbilityInterceptor as APP_INTERCEPTOR in MainModule.",
			);
		}
		return req.ability;
	},
);
