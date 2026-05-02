import { PrismaClientService } from "@infrastructure/prisma-client/prisma-client.service";
import { Injectable, Logger } from "@nestjs/common";
import { MemberRole } from "@prisma/client";

import { FirebaseAdminService } from "./firebase-admin.service";
import { TenantMembershipClaim } from "./types/auth-user.type";

// Rebuilds a user's Firebase custom claims from the source-of-truth rows
// in Postgres. Called by:
//   - AuthFeatureService during sign-in session exchange
//   - InvitationProcessingService after an accept
//   - Any other flow that mutates Member rows (role change, remove, etc.)
//
// Lives in infrastructure so both Features and Processes can depend on
// it without crossing the Feature→Process boundary. Talks to Prisma
// directly rather than through TenantService/UserService (which would
// require Infra → Core, disallowed).
@Injectable()
export class UserClaimsService {
	private readonly logger = new Logger(UserClaimsService.name);

	constructor(
		private readonly firebase: FirebaseAdminService,
		private readonly prisma: PrismaClientService,
	) {}

	async refreshFor(firebaseUid: string): Promise<{
		isSuperAdmin: boolean;
		memberships: Array<{ slug: string; memberId: string; role: MemberRole }>;
	}> {
		const user = await this.prisma.user.findUnique({ where: { firebaseUid } });
		if (!user) {
			this.logger.warn(`refreshFor: no user for firebaseUid=${firebaseUid}`);
			return { isSuperAdmin: false, memberships: [] };
		}

		const members = await this.prisma.member.findMany({
			where: { userId: user.id, deletedAt: null, tenant: { deletedAt: null } },
			include: { tenant: { select: { slug: true, name: true } } },
		});

		const memberships = members.map((m) => ({
			slug: m.tenant.slug,
			name: m.tenant.name,
			memberId: m.id,
			role: m.role,
		}));

		const tenantMemberships: Record<string, TenantMembershipClaim> = {};
		for (const m of memberships) {
			tenantMemberships[m.slug] = {
				memberId: m.memberId,
				role: m.role,
				name: m.name,
			};
		}

		await this.firebase.setCustomClaims(firebaseUid, {
			isSuperAdmin: user.isSuperAdmin,
			tenantMemberships,
		});

		return { isSuperAdmin: user.isSuperAdmin, memberships };
	}
}
