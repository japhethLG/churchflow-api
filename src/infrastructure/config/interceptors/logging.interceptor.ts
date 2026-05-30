import {
	CallHandler,
	ExecutionContext,
	Injectable,
	Logger,
	NestInterceptor,
} from "@nestjs/common";
import { Request, Response } from "express";
import { Observable } from "rxjs";
import { tap } from "rxjs/operators";

// Per-request timing log: method, route, status, and wall-clock ms. Gives
// us the TTFB/handler-duration signal the backend was missing, so a slow
// navigation can be split into network vs handler vs DB time (pairs with
// the FE's onRouterTransitionStart / Web Vitals). Uses the matched route
// pattern (e.g. /tenants/:tenantId/members) rather than the concrete URL
// so log lines aggregate cleanly instead of exploding per-id.
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
	private readonly logger = new Logger("HTTP");

	intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
		if (context.getType() !== "http") {
			return next.handle();
		}

		const http = context.switchToHttp();
		const req = http.getRequest<Request>();
		const res = http.getResponse<Response>();
		const start = process.hrtime.bigint();
		const route = (req.route?.path as string | undefined) ?? req.url;
		const label = `${req.method} ${route}`;

		const log = (outcome: string): void => {
			const ms = Number(process.hrtime.bigint() - start) / 1e6;
			this.logger.log(`${label} ${outcome} ${ms.toFixed(1)}ms`);
		};

		return next.handle().pipe(
			tap({
				next: () => log(String(res.statusCode)),
				error: (err: unknown) => {
					const status =
						err && typeof err === "object" && "status" in err
							? String((err as { status: unknown }).status)
							: "ERR";
					log(status);
				},
			}),
		);
	}
}
