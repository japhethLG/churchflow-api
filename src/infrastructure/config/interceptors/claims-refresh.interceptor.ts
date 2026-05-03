import { REFRESHES_CLAIMS_KEY } from "@infrastructure/firebase-auth/decorators/refreshes-claims.decorator";
import {
	CallHandler,
	ExecutionContext,
	Injectable,
	NestInterceptor,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Response } from "express";
import { Observable } from "rxjs";
import { tap } from "rxjs/operators";

// Pairs with the @RefreshesClaims() decorator. When a handler that's
// flagged returns successfully, set X-Claims-Refreshed: 1 on the
// response. The frontend's response middleware sees this header and
// auto-refreshes the Next session cookie — removes the "did you remember
// to call refreshSession()?" footgun on every claim-mutating path.
@Injectable()
export class ClaimsRefreshInterceptor implements NestInterceptor {
	constructor(private readonly reflector: Reflector) {}

	intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
		const refreshes = this.reflector.getAllAndOverride<boolean>(
			REFRESHES_CLAIMS_KEY,
			[context.getHandler(), context.getClass()],
		);

		return next.handle().pipe(
			tap(() => {
				if (!refreshes) {
					return;
				}
				const res = context.switchToHttp().getResponse<Response>();
				// Only set if not already sent — guards against duplicates if
				// a handler chains multiple claim refreshes.
				if (!res.headersSent) {
					res.setHeader("X-Claims-Refreshed", "1");
				}
			}),
		);
	}
}
