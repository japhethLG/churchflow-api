import { Injectable } from '@nestjs/common';

import { AuditAction, type Tenant } from '@prisma/client';

import type { AuthUser } from '@infrastructure/firebase-auth/types/auth-user.type';

import { AuditService } from '@modules/core/audit/services/audit.service';
import { TenantService } from '@modules/core/tenant/services/tenant.service';

import type {
  CreateTenantRequestDto,
  RenameTenantRequestDto,
  UpdateTenantRequestDto,
} from '../dto/tenant.request.dto';

@Injectable()
export class TenantFeatureService {
  constructor(
    private readonly tenantService: TenantService,
    private readonly auditService: AuditService,
  ) {}

  async create(user: AuthUser, data: CreateTenantRequestDto): Promise<Tenant> {
    const tenant = await this.tenantService.create({
      ...data,
      createdBy: user.firebaseUid,
    });
    await this.auditService.record({
      tenantId: tenant.id,
      actorUid: user.firebaseUid,
      actorEmail: user.email,
      action: AuditAction.CREATE,
      entity: 'Tenant',
      entityId: tenant.id,
      summary: `Created church "${tenant.name}" (slug=${tenant.slug})`,
    });
    return tenant;
  }

  async list(): Promise<Tenant[]> {
    return this.tenantService.getAll();
  }

  async getByIdOrSlug(idOrSlug: string): Promise<Tenant> {
    return this.tenantService.getByIdOrSlug(idOrSlug);
  }

  async update(
    user: AuthUser,
    id: string,
    data: UpdateTenantRequestDto,
  ): Promise<Tenant> {
    const tenant = await this.tenantService.update(id, data);
    await this.auditService.record({
      tenantId: tenant.id,
      actorUid: user.firebaseUid,
      actorEmail: user.email,
      action: AuditAction.UPDATE,
      entity: 'Tenant',
      entityId: tenant.id,
      diff: { after: data },
    });
    return tenant;
  }

  async rename(
    user: AuthUser,
    id: string,
    data: RenameTenantRequestDto,
  ): Promise<Tenant> {
    const before = await this.tenantService.getById(id);
    const tenant = await this.tenantService.rename(id, data.slug);
    await this.auditService.record({
      tenantId: tenant.id,
      actorUid: user.firebaseUid,
      actorEmail: user.email,
      action: AuditAction.UPDATE,
      entity: 'Tenant',
      entityId: tenant.id,
      summary: `Renamed slug "${before.slug}" → "${tenant.slug}"`,
      diff: { before: { slug: before.slug }, after: { slug: tenant.slug } },
    });
    return tenant;
  }

  async delete(user: AuthUser, id: string): Promise<Tenant> {
    const tenant = await this.tenantService.delete(id);
    await this.auditService.record({
      tenantId: tenant.id,
      actorUid: user.firebaseUid,
      actorEmail: user.email,
      action: AuditAction.DELETE,
      entity: 'Tenant',
      entityId: tenant.id,
    });
    return tenant;
  }

  async restore(user: AuthUser, id: string): Promise<Tenant> {
    const tenant = await this.tenantService.restore(id);
    await this.auditService.record({
      tenantId: tenant.id,
      actorUid: user.firebaseUid,
      actorEmail: user.email,
      action: AuditAction.RESTORE,
      entity: 'Tenant',
      entityId: tenant.id,
    });
    return tenant;
  }

  suggestSlug(name: string): string {
    return TenantService.suggestSlug(name);
  }
}
