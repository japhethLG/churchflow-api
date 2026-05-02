import { createParamDecorator, ExecutionContext } from "@nestjs/common";

import { Request } from "express";

import { AuthUser } from "../types/auth-user.type";

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
