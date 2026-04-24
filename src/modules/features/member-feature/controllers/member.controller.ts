import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';

import { CurrentTenant } from '@infrastructure/firebase-auth/decorators/current-tenant.decorator';
import { CurrentUser } from '@infrastructure/firebase-auth/decorators/current-user.decorator';
import { TenantRoles } from '@infrastructure/firebase-auth/decorators/roles.decorator';
import { TenantGuard } from '@infrastructure/firebase-auth/guards/tenant.guard';
import type {
  AuthUser,
  TenantContext,
} from '@infrastructure/firebase-auth/types/auth-user.type';

import { DeleteResponseDto } from '@shared/dto/delete-response.dto';

import {
  CreateMemberRequestDto,
  MemberFiltersRequestDto,
  UpdateMemberRequestDto,
} from '../dto/member.request.dto';
import {
  MemberListResponseDto,
  MemberResponseDto,
} from '../dto/member.response.dto';
import { MemberFeatureService } from '../services/member-feature.service';

@ApiTags('members')
@ApiBearerAuth('Bearer')
@ApiParam({ name: 'tenantId', description: 'Tenant UUID or slug' })
@UseGuards(TenantGuard)
@Controller('tenants/:tenantId/members')
export class MemberController {
  constructor(private readonly memberFeatureService: MemberFeatureService) {}

  @TenantRoles('ADMIN')
  @Post()
  @ApiOperation({ summary: 'Create a temp member (admin only)' })
  @ApiCreatedResponse({ type: MemberResponseDto })
  async create(
    @CurrentUser() user: AuthUser,
    @CurrentTenant() tenant: TenantContext,
    @Body() body: CreateMemberRequestDto,
  ): Promise<MemberResponseDto> {
    return this.memberFeatureService.create(
      user,
      tenant,
      body,
    ) as unknown as Promise<MemberResponseDto>;
  }

  @TenantRoles('ADMIN')
  @Get()
  @ApiOperation({ summary: 'List members (admin only)' })
  @ApiOkResponse({ type: MemberListResponseDto })
  async list(
    @CurrentTenant() tenant: TenantContext,
    @Query() filters: MemberFiltersRequestDto,
  ): Promise<MemberListResponseDto> {
    const result = await this.memberFeatureService.list(tenant, filters);
    return {
      items: result.items as unknown as MemberResponseDto[],
      meta: {
        offset: filters.offset ?? 0,
        limit: filters.limit ?? result.items.length,
        total: result.total,
      },
    };
  }

  @Get('me')
  @ApiOperation({
    summary: 'Get the current user’s member row in this tenant',
    description:
      'Any member (USER or ADMIN) can call this for themselves. Super-admins with no Member row in the tenant get 404.',
  })
  @ApiOkResponse({ type: MemberResponseDto })
  async me(@CurrentTenant() tenant: TenantContext): Promise<MemberResponseDto> {
    return this.memberFeatureService.getMe(tenant) as unknown as Promise<MemberResponseDto>;
  }

  @TenantRoles('ADMIN')
  @Get(':id')
  @ApiOperation({ summary: 'Get a member by id (admin only)' })
  @ApiOkResponse({ type: MemberResponseDto })
  async getById(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ): Promise<MemberResponseDto> {
    return this.memberFeatureService.getById(
      tenant,
      id,
    ) as unknown as Promise<MemberResponseDto>;
  }

  @TenantRoles('ADMIN')
  @Patch(':id')
  @ApiOperation({ summary: 'Update a member' })
  @ApiOkResponse({ type: MemberResponseDto })
  async update(
    @CurrentUser() user: AuthUser,
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() body: UpdateMemberRequestDto,
  ): Promise<MemberResponseDto> {
    return this.memberFeatureService.update(
      user,
      tenant,
      id,
      body,
    ) as unknown as Promise<MemberResponseDto>;
  }

  @TenantRoles('ADMIN')
  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete a member' })
  @ApiOkResponse({ type: DeleteResponseDto })
  async delete(
    @CurrentUser() user: AuthUser,
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ): Promise<DeleteResponseDto> {
    const deleted = await this.memberFeatureService.delete(user, tenant, id);
    return { id: deleted.id };
  }
}
