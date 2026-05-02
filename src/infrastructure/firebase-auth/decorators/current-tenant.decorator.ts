import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import type { TenantContext } from "../types/auth-user.type";

// Companion to @CurrentUser. Returns the tenant context attached by
// TenantGuard. Handlers that read this MUST be on a controller that has
// TenantGuard applied, otherwise the context will be undefined.
export const CurrentTenant = createParamDecorator(
	(_data: unknown, ctx: ExecutionContext): TenantContext => {
		const req = ctx
			.switchToHttp()
			.getRequest<Request & { tenant?: TenantContext }>();
		if (!req.tenant) {
			throw new Error(
				"TenantContext missing — did you forget @UseGuards(TenantGuard) on this controller?",
			);
		}
		return req.tenant;
	},
);
