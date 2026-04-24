import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { Request } from 'express';

import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { FirebaseAdminService } from '../firebase-admin.service';
import type { AuthUser, TenantMembershipClaim } from '../types/auth-user.type';

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

    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const token = this.extractToken(req);
    if (!token) throw new UnauthorizedException('Missing bearer token');

    try {
      const decoded = await this.firebase.verifyIdToken(token);
      req.user = {
        firebaseUid: decoded.uid,
        email: decoded.email ?? '',
        displayName: decoded.name,
        picture: decoded.picture,
        isSuperAdmin: Boolean(decoded.isSuperAdmin),
        tenantMemberships: this.readMemberships(decoded.tenantMemberships),
      };
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  // tenantMemberships claim shape is Record<slug, { memberId, role }>.
  // Guard against malformed claims by coercing / dropping bad entries.
  private readMemberships(raw: unknown): Record<string, TenantMembershipClaim> {
    if (!raw || typeof raw !== 'object') return {};
    const out: Record<string, TenantMembershipClaim> = {};
    for (const [slug, value] of Object.entries(raw as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') continue;
      const entry = value as Record<string, unknown>;
      const memberId = typeof entry.memberId === 'string' ? entry.memberId : undefined;
      const role = entry.role === 'ADMIN' || entry.role === 'USER' ? entry.role : undefined;
      if (memberId && role) {
        out[slug] = { memberId, role };
      }
    }
    return out;
  }

  private extractToken(req: Request): string | null {
    const header = req.headers.authorization;
    if (!header || typeof header !== 'string') return null;
    const [scheme, value] = header.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !value) return null;
    return value;
  }
}
