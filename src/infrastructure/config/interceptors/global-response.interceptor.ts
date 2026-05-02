import type {
	CallHandler,
	ExecutionContext,
	NestInterceptor,
} from "@nestjs/common";
import { Injectable } from "@nestjs/common";

import type { Observable } from "rxjs";
import { map } from "rxjs/operators";

export interface ApiResponse<T> {
	success: true;
	data: T;
}

@Injectable()
export class GlobalResponseInterceptor<T>
	implements NestInterceptor<T, ApiResponse<T> | T>
{
	intercept(
		_context: ExecutionContext,
		next: CallHandler<T>,
	): Observable<ApiResponse<T> | T> {
		return next.handle().pipe(
			map((data) => {
				if (data === null || data === undefined) return data;
				if (typeof data === "object" && data !== null && "success" in data)
					return data;
				return { success: true, data };
			}),
		);
	}
}
