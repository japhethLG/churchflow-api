import { ForbiddenError, subject as castSubject } from "@casl/ability";
import { ForbiddenException } from "@nestjs/common";

import { Actions, AppAbility } from "./ability.types";

// String names of every CASL subject in the system. Class-level checks
// (e.g. "can the caller create any Member at all?") accept these directly;
// instance-level checks must wrap a Prisma row via `asSubject()` so CASL
// can match conditions.
export type SubjectName =
	| "Tenant"
	| "Member"
	| "Transaction"
	| "Pledge"
	| "Campaign"
	| "CampaignItem"
	| "Invitation"
	| "PlatformAdmin"
	| "all";

export function assertCan(
	ability: AppAbility,
	action: Actions,
	subject: SubjectName | object,
): void {
	try {
		ForbiddenError.from(ability).throwUnlessCan(action, subject as never);
	} catch (err) {
		if (err instanceof ForbiddenError) {
			throw new ForbiddenException(err.message);
		}
		throw err;
	}
}

// Tags a Prisma row as a CASL subject so condition rules can match it.
// Usage: assertCan(ability, "update", asSubject("Member", member));
export function asSubject<T extends object>(type: SubjectName, resource: T): T {
	return castSubject(type, resource) as T;
}
