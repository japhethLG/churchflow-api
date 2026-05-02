import { PrismaClientService } from "@infrastructure/prisma-client/prisma-client.service";
import {
	CanActivate,
	ExecutionContext,
	ForbiddenException,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Request } from "express";

import {
	TENANT_ROLES_KEY,
	type TenantRole,
} from "../decorators/roles.decorator";
import { AuthUser, TenantContext } from "../types/auth-user.type";

// Applied (via @UseGuards) on controllers that have :tenantId in the
// route. Responsibilities:
//
//   1. Resolve :tenantId (UUID or slug) to a real tenant. 404 if missing.
//   2. Verify the caller is a member of that tenant OR is a super-admin.
//   3. If @TenantRoles() is present, verify the caller's role matches.
//      (Super-admins always pass tenant-role checks.)
//   4. Attach TenantContext (`req.tenant`) for downstream consumers.
//
// Runs AFTER FirebaseAuthGuard (which is a global APP_GUARD) so
// `req.user` is reliable here.
//
// Uses PrismaClientService directly rather than TenantCoreModule because
// allowing Infra → Core violates the Griffin layering rule. The lookup is
// a single findFirst; it's not worth opening a layer hole for that.
@Injectable()
export class TenantGuard implements CanActivate {
	constructor(
		private readonly reflector: Reflector,
		private readonly prisma: PrismaClientService,
	) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const req = context.switchToHttp().getRequest<
			Request & {
				user?: AuthUser;
				tenant?: TenantContext;
				params: Record<string, string>;
			}
		>();

		const user = req.user;
		if (!user) throw new ForbiddenException("No authenticated user");

		const idOrSlug = req.params.tenantId;
		if (!idOrSlug) {
			throw new ForbiddenException("Missing :tenantId parameter");
		}

		const tenant = await this.prisma.tenant.findFirst({
			where: {
				OR: [{ id: idOrSlug }, { slug: idOrSlug }],
				deletedAt: null,
			},
			select: { id: true, slug: true },
		});
		if (!tenant) throw new NotFoundException(`Tenant not found: ${idOrSlug}`);

		const membership = user.tenantMemberships[tenant.slug];
		if (!membership && !user.isSuperAdmin) {
			// Don't leak existence to non-members — same 404 as if missing.
			throw new NotFoundException(`Tenant not found: ${idOrSlug}`);
		}

		const required = this.reflector.getAllAndOverride<TenantRole[]>(
			TENANT_ROLES_KEY,
			[context.getHandler(), context.getClass()],
		);

		if (required && required.length > 0 && !user.isSuperAdmin) {
			if (!membership || !required.includes(membership.role)) {
				throw new ForbiddenException(
					`Requires tenant role: ${required.join(" or ")}`,
				);
			}
		}

		req.tenant = {
			tenantId: tenant.id,
			slug: tenant.slug,
			memberId: membership?.memberId,
			role: membership?.role,
		};

		return true;
	}
}
