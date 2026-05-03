import { MongoAbility } from "@casl/ability";
import { PrismaQuery, Subjects } from "@casl/prisma";
import {
	Campaign,
	CampaignItem,
	Invitation,
	Member,
	Pledge,
	Tenant,
	Transaction,
} from "@prisma/client";

// Subjects = the protected resources in the system. Each entry pairs the
// subject name with its Prisma model row shape so CASL can typecheck
// MongoDB-style condition objects (e.g. `{ memberId: tenant.memberId }`).
//
// To check class-level access:   ability.can("read", "Member");
// To check instance-level access: assertCan(ability, "update", asSubject("Member", row));
export type AppSubjects =
	| Subjects<{
			Tenant: Tenant;
			Member: Member;
			Transaction: Transaction;
			Pledge: Pledge;
			Campaign: Campaign;
			CampaignItem: CampaignItem;
			Invitation: Invitation;
	  }>
	| "PlatformAdmin"
	| "all";

// Action wildcard `manage` matches every other action and is granted to
// super-admins.
export type Actions = "manage" | "create" | "read" | "update" | "delete";

// Single application-wide ability type. Every guard, decorator and service
// uses this exact alias so changes propagate cleanly.
export type AppAbility = MongoAbility<[Actions, AppSubjects], PrismaQuery>;
