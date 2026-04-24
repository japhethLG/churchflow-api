import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { Request } from 'express';

import { ROLES_KEY, type PlatformRole } from '../decorators/roles.decorator';
import type { AuthUser } from '../types/auth-user.type';

// Enforces @Roles('SUPER_ADMIN') at the platform level (routes with no
// tenant scope — e.g. POST /tenants). Per-tenant role checks live in
// TenantGuard via @TenantRoles().
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<PlatformRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const user = req.user;
    if (!user) throw new ForbiddenException('No authenticated user');

    if (required.includes('SUPER_ADMIN') && user.isSuperAdmin) return true;

    throw new ForbiddenException(`Requires one of: ${required.join(', ')}`);
  }
}
