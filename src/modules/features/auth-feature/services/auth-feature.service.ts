import { FirebaseAdminService } from "@infrastructure/firebase-auth/firebase-admin.service";
import { UserClaimsService } from "@infrastructure/firebase-auth/user-claims.service";
import { TenantService } from "@modules/core/tenant/services/tenant.service";
import { UserService } from "@modules/core/user/services/user.service";
import { Injectable } from "@nestjs/common";
import { MemberRole, User } from "@prisma/client";

export interface TenantMembershipView {
	tenantId: string;
	slug: string;
	name: string;
	memberId: string;
	role: MemberRole;
}

export interface SessionResult {
	user: User;
	tenantMemberships: TenantMembershipView[];
	isSuperAdmin: boolean;
}

@Injectable()
export class AuthFeatureService {
	constructor(
		private readonly userService: UserService,
		private readonly tenantService: TenantService,
		private readonly firebase: FirebaseAdminService,
		private readonly userClaims: UserClaimsService,
	) {}

	// Called by POST /api/v1/auth/session on every sign-in. Snapshots every
	// tenant the user currently belongs to into custom claims
	// (tenantMemberships + isSuperAdmin). There is no "active tenant" claim
	// — the URL (/[slug]/…) is the authoritative context for which church
	// a request targets.
	//
	// The frontend calls refreshSession() any time memberships change
	// (invite accepted, admin grants a role) so a fresh token picks up the
	// new claims.
	async exchangeIdToken(idToken: string): Promise<SessionResult> {
		// Verify + decode the ID token. The FirebaseAuthGuard does this for
		// authenticated routes; this endpoint is @Public and has to do it
		// itself.
		const decoded = await this.firebase.verifyIdToken(idToken);

		const user = await this.userService.upsertByFirebaseUid({
			firebaseUid: decoded.uid,
			email: decoded.email ?? "",
			displayName: decoded.name ?? decoded.email ?? decoded.uid,
			photoUrl: decoded.picture,
		});

		// Pull fresh tenant rows (with slugs) so the response and claims
		// stay aligned — the UI renders memberships straight from here.
		const tenants = await this.tenantService.getAllForUser(user.id);
		const tenantMemberships: TenantMembershipView[] = tenants.map((t) => ({
			tenantId: t.id,
			slug: t.slug,
			name: t.name,
			memberId: t.memberId,
			role: t.role,
		}));

		await this.userClaims.refreshFor(decoded.uid);

		return { user, tenantMemberships, isSuperAdmin: user.isSuperAdmin };
	}

	// Revokes every refresh token for the caller's Firebase user. Any
	// session cookie minted from a token issued before this call will
	// fail verifySessionCookie(_, true) — which is what kicks other tabs
	// and devices to /login. The caller's *current* device is logged out
	// by the client (Firebase signOut + DELETE /api/auth/session).
	async signOutEverywhere(firebaseUid: string): Promise<void> {
		await this.firebase.getAuth().revokeRefreshTokens(firebaseUid);
		// Drop any cached token verifications for this user so this instance
		// stops honouring already-issued credentials immediately, rather than
		// trusting them until the short verify-cache TTL lapses.
		this.firebase.invalidateUser(firebaseUid);
	}
}
