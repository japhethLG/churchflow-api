export type TenantRole = "ADMIN" | "USER";

export interface TenantMembershipClaim {
	memberId: string;
	role: TenantRole;
	name: string; // tenant display name (e.g. "First Baptist Church")
}

// Decoded Firebase token → normalized app-level user shape.
//
// There is NO active-tenant flag here. A user's tenant context is derived
// from the URL at request time (see TenantGuard). The `tenantMemberships`
// map — keyed by tenant slug — lists every church the user belongs to and
// their role in each.
export interface AuthUser {
	firebaseUid: string;
	email: string;
	displayName?: string;
	picture?: string;
	isSuperAdmin: boolean;
	tenantMemberships: Record<string, TenantMembershipClaim>;
}

// Populated by TenantGuard for tenant-scoped routes. Controllers read this
// instead of juggling :tenantId params themselves.
export interface TenantContext {
	tenantId: string; // always the UUID (regardless of how the caller addressed the tenant)
	slug: string;
	memberId?: string; // undefined for super-admins without a Member row here
	role?: TenantRole; // undefined for super-admins without a Member row here
}
