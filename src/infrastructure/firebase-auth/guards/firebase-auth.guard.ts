import {
	CanActivate,
	ExecutionContext,
	Injectable,
	UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { Request } from "express";

import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import { FirebaseAdminService } from "../firebase-admin.service";
import { AuthUser, TenantMembershipClaim } from "../types/auth-user.type";

@Injectable()
export class FirebaseAuthGuard implements CanActivate {
	constructor(
		private readonly reflector: Reflector,
		private readonly firebase: FirebaseAdminService,
	) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
			context.getHandler(),
			context.getClass(),
		]);
		if (isPublic) return true;

		const req = context
			.switchToHttp()
			.getRequest<Request & { user?: AuthUser }>();
		const credential = this.extractCredential(req);
		if (!credential) throw new UnauthorizedException("Missing bearer token");

		try {
			const decoded =
				credential.scheme === "bearer"
					? await this.firebase.verifyIdToken(credential.value)
					: await this.firebase.verifySessionCookie(credential.value);
			req.user = {
				firebaseUid: decoded.uid,
				email: decoded.email ?? "",
				displayName: decoded.name,
				picture: decoded.picture,
				isSuperAdmin: Boolean(decoded.isSuperAdmin),
				tenantMemberships: this.readMemberships(decoded.tenantMemberships),
			};
			return true;
		} catch {
			throw new UnauthorizedException("Invalid or expired token");
		}
	}

	// tenantMemberships claim shape is Record<slug, { memberId, role }>.
	// Guard against malformed claims by coercing / dropping bad entries.
	private readMemberships(raw: unknown): Record<string, TenantMembershipClaim> {
		if (!raw || typeof raw !== "object") return {};
		const out: Record<string, TenantMembershipClaim> = {};
		for (const [slug, value] of Object.entries(
			raw as Record<string, unknown>,
		)) {
			if (!value || typeof value !== "object") continue;
			const entry = value as Record<string, unknown>;
			const memberId =
				typeof entry.memberId === "string" ? entry.memberId : undefined;
			const role =
				entry.role === "ADMIN" || entry.role === "USER"
					? entry.role
					: undefined;
			const name = typeof entry.name === "string" ? entry.name : slug;
			if (memberId && role) {
				out[slug] = { memberId, role, name };
			}
		}
		return out;
	}

	// Two accepted schemes:
	//   "Bearer <ID token>"        — browser sending a Firebase ID token.
	//   "SessionCookie <cookie>"   — Next server forwarding the user's
	//                                  HTTP-only session cookie for an
	//                                  RSC-side fetch (the cookie is
	//                                  unreadable from JS so it has to
	//                                  be carried server-side).
	private extractCredential(
		req: Request,
	): { scheme: "bearer" | "session-cookie"; value: string } | null {
		const header = req.headers.authorization;
		if (!header || typeof header !== "string") return null;
		const [rawScheme, value] = header.split(" ");
		if (!value) return null;
		const scheme = rawScheme?.toLowerCase();
		if (scheme === "bearer") return { scheme: "bearer", value };
		if (scheme === "sessioncookie") return { scheme: "session-cookie", value };
		return null;
	}
}
