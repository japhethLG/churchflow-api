import { createHash } from "node:crypto";
import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as admin from "firebase-admin";

type CachedVerification = {
	decoded: admin.auth.DecodedIdToken;
	uid: string;
	expiresAt: number;
};

// Hard cap so a flood of distinct credentials can't grow the map without
// bound. Far above any realistic concurrent-user count for one instance.
const VERIFY_CACHE_MAX_ENTRIES = 5_000;
const DEFAULT_VERIFY_CACHE_TTL_MS = 30_000;

@Injectable()
export class FirebaseAdminService implements OnModuleInit {
	private readonly logger = new Logger(FirebaseAdminService.name);
	private app!: admin.app.App;

	// Short-TTL cache of successful token/cookie verifications. The Admin
	// SDK's verify*(_, true) calls hit Firebase over the network to check
	// revocation; because every page renders ~9 parallel client requests
	// carrying the SAME credential, that's ~9 identical revocation
	// round-trips per navigation. Caching the decode for a few seconds
	// collapses the burst into one network call while still re-checking
	// revocation every TTL. signOutEverywhere() calls invalidateUser() so a
	// revoked user is dropped from this instance immediately rather than
	// after the TTL. Only successful verifications are cached — failures
	// always re-hit Firebase.
	private readonly verifyCache = new Map<string, CachedVerification>();
	private verifyCacheTtlMs = DEFAULT_VERIFY_CACHE_TTL_MS;

	constructor(private readonly config: ConfigService) {}

	onModuleInit(): void {
		const configured = this.config.get<string>("AUTH_VERIFY_CACHE_TTL_MS");
		if (configured !== undefined) {
			const parsed = Number(configured);
			if (Number.isFinite(parsed) && parsed >= 0) {
				this.verifyCacheTtlMs = parsed;
			}
		}

		if (admin.apps.length > 0) {
			this.app = admin.apps[0] as admin.app.App;
			return;
		}

		const credential = this.loadCredential();
		this.app = admin.initializeApp({ credential });
		this.logger.log("Firebase Admin initialised");
	}

	getAuth(): admin.auth.Auth {
		return this.app.auth();
	}

	async verifyIdToken(idToken: string): Promise<admin.auth.DecodedIdToken> {
		return this.verifyCached("idtoken", idToken, (value) =>
			this.getAuth().verifyIdToken(value, true),
		);
	}

	// Verifies a Firebase session cookie (the long-lived cookie minted by
	// adminAuth.createSessionCookie). Decoded shape mirrors verifyIdToken
	// so the guard can treat both auth schemes identically.
	async verifySessionCookie(
		sessionCookie: string,
	): Promise<admin.auth.DecodedIdToken> {
		return this.verifyCached("cookie", sessionCookie, (value) =>
			this.getAuth().verifySessionCookie(value, true),
		);
	}

	// Drops every cached verification for a uid. Called after revoking a
	// user's refresh tokens so this instance stops honouring their
	// in-flight credentials before the TTL would otherwise expire.
	invalidateUser(uid: string): void {
		for (const [key, entry] of this.verifyCache) {
			if (entry.uid === uid) {
				this.verifyCache.delete(key);
			}
		}
	}

	// Looks up (or performs and caches) a verification. The cache key is a
	// SHA-256 of the credential — we never hold the raw token/cookie in the
	// map. The decoded token's own `exp` still applies downstream; the TTL
	// only bounds how long we trust the revocation check.
	private async verifyCached(
		prefix: string,
		credential: string,
		verifier: (value: string) => Promise<admin.auth.DecodedIdToken>,
	): Promise<admin.auth.DecodedIdToken> {
		if (this.verifyCacheTtlMs <= 0) {
			return verifier(credential);
		}

		const key = `${prefix}:${createHash("sha256").update(credential).digest("hex")}`;
		const now = Date.now();
		const hit = this.verifyCache.get(key);
		if (hit && hit.expiresAt > now) {
			return hit.decoded;
		}

		const decoded = await verifier(credential);
		this.setVerifyCache(key, {
			decoded,
			uid: decoded.uid,
			expiresAt: now + this.verifyCacheTtlMs,
		});
		return decoded;
	}

	private setVerifyCache(key: string, entry: CachedVerification): void {
		// Opportunistic prune of expired entries; if still at capacity drop
		// the oldest (insertion-ordered Map) to bound memory.
		if (this.verifyCache.size >= VERIFY_CACHE_MAX_ENTRIES) {
			const now = Date.now();
			for (const [k, e] of this.verifyCache) {
				if (e.expiresAt <= now) {
					this.verifyCache.delete(k);
				}
			}
			while (this.verifyCache.size >= VERIFY_CACHE_MAX_ENTRIES) {
				const oldest = this.verifyCache.keys().next().value;
				if (oldest === undefined) {
					break;
				}
				this.verifyCache.delete(oldest);
			}
		}
		this.verifyCache.set(key, entry);
	}

	async setCustomClaims(
		uid: string,
		claims: Record<string, unknown>,
	): Promise<void> {
		await this.getAuth().setCustomUserClaims(uid, claims);
	}

	async getUser(uid: string): Promise<admin.auth.UserRecord> {
		return this.getAuth().getUser(uid);
	}

	private loadCredential(): admin.credential.Credential {
		const projectId = this.config.get<string>("FIREBASE_PROJECT_ID");
		const clientEmail = this.config.get<string>("FIREBASE_CLIENT_EMAIL");
		const privateKey = this.config
			.get<string>("FIREBASE_PRIVATE_KEY")
			?.replace(/\\n/g, "\n");

		if (!projectId || !clientEmail || !privateKey) {
			throw new Error(
				"Firebase credentials missing. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY.",
			);
		}

		return admin.credential.cert({ projectId, clientEmail, privateKey });
	}
}
