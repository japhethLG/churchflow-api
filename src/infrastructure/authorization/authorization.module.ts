import { Global, Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";

import { AbilityFactory } from "./ability.factory";
import { AbilityInterceptor } from "./ability.interceptor";
import { PolicyGuard } from "./policy.guard";

// Global so feature modules don't need to re-import to use AbilityFactory,
// the policy guard, or the @CurrentAbility() decorator.
//
// AbilityInterceptor is registered as APP_INTERCEPTOR here (not in
// MainModule) to keep authorization wiring colocated.
@Global()
@Module({
	providers: [
		AbilityFactory,
		PolicyGuard,
		{ provide: APP_INTERCEPTOR, useClass: AbilityInterceptor },
	],
	exports: [AbilityFactory, PolicyGuard],
})
export class AuthorizationModule {}
