import type { ExecutionContext } from "@nestjs/common";
import { createParamDecorator } from "@nestjs/common";

import type { Request } from "express";

import type { AuthUser } from "../types/auth-user.type";

export const CurrentUser = createParamDecorator(
	(_data: unknown, ctx: ExecutionContext): AuthUser => {
		const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();

		if (!req.user) {
			throw new Error(
				"CurrentUser decorator used on a route with no authenticated user",
			);
		}

		return req.user;
	},
);
