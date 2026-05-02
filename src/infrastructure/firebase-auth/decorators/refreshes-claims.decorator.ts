import { SetMetadata } from "@nestjs/common";

// Mark a handler whose successful path may rewrite the *caller's* own
// Firebase custom claims (tenantMemberships, isSuperAdmin). The
// ClaimsRefreshInterceptor reads this metadata and sets the
// X-Claims-Refreshed: 1 response header so the frontend knows to
// re-mint its session cookie via getIdToken(true).
//
// Don't mark a handler that only mutates *other* users' claims (e.g. an
// admin removing a different member). Those callers have correct claims
// already; the affected user's claims update on their next token refresh
// or sign-in. Real-time push to other devices is a separate concern.
export const REFRESHES_CLAIMS_KEY = "refreshes_claims";
export const RefreshesClaims = (): MethodDecorator =>
	SetMetadata(REFRESHES_CLAIMS_KEY, true);
