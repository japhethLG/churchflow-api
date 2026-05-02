import { SetMetadata } from "@nestjs/common";

// Platform-level role gate. Applied globally by RolesGuard on any handler
// tagged with @Roles('SUPER_ADMIN'). For tenant-scoped role checks (ADMIN
// vs USER within a specific church), use @TenantRoles() which is enforced
// by TenantGuard after the tenant context is resolved.
export const ROLES_KEY = "roles";
export type PlatformRole = "SUPER_ADMIN";
export const Roles = (
	...roles: PlatformRole[]
): MethodDecorator & ClassDecorator => SetMetadata(ROLES_KEY, roles);

// Tenant-scoped role gate. Applied per-handler on controllers that have
// :tenantId in the path. Without this decorator, TenantGuard only
// enforces membership; with it, it additionally checks the role.
//
// Super-admins always pass tenant-role checks (they administer the
// platform — individual church role doesn't apply to them).
export const TENANT_ROLES_KEY = "tenantRoles";
export type TenantRole = "ADMIN" | "USER";
export const TenantRoles = (
	...roles: TenantRole[]
): MethodDecorator & ClassDecorator => SetMetadata(TENANT_ROLES_KEY, roles);
