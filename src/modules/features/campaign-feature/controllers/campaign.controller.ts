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
  CampaignFiltersRequestDto,
  CreateCampaignItemRequestDto,
  CreateCampaignRequestDto,
  UpdateCampaignItemRequestDto,
  UpdateCampaignRequestDto,
} from '../dto/campaign.request.dto';
import {
  CampaignItemResponseDto,
  CampaignListResponseDto,
  CampaignProgressResponseDto,
  CampaignResponseDto,
  CampaignWithItemsResponseDto,
} from '../dto/campaign.response.dto';
import { CampaignFeatureService } from '../services/campaign-feature.service';

@ApiTags('campaigns')
@ApiBearerAuth('Bearer')
@ApiParam({ name: 'tenantId', description: 'Tenant UUID or slug' })
@UseGuards(TenantGuard)
@Controller('tenants/:tenantId/campaigns')
export class CampaignController {
  constructor(private readonly campaignFeatureService: CampaignFeatureService) {}

  @TenantRoles('ADMIN')
  @Post()
  @ApiOperation({ summary: 'Create a campaign' })
  @ApiCreatedResponse({ type: CampaignResponseDto })
  async create(
    @CurrentUser() user: AuthUser,
    @CurrentTenant() tenant: TenantContext,
    @Body() body: CreateCampaignRequestDto,
  ): Promise<CampaignResponseDto> {
    return this.campaignFeatureService.create(
      user,
      tenant,
      body,
    ) as unknown as Promise<CampaignResponseDto>;
  }

  @Get()
  @ApiOperation({ summary: 'List campaigns for a tenant' })
  @ApiOkResponse({ type: CampaignListResponseDto })
  async list(
    @CurrentTenant() tenant: TenantContext,
    @Query() filters: CampaignFiltersRequestDto,
  ): Promise<CampaignListResponseDto> {
    const result = await this.campaignFeatureService.list(tenant, filters);
    return {
      items: result.items as unknown as CampaignResponseDto[],
      meta: {
        offset: filters.offset ?? 0,
        limit: filters.limit ?? result.items.length,
        total: result.total,
      },
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a campaign with its items' })
  @ApiOkResponse({ type: CampaignWithItemsResponseDto })
  async getById(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ): Promise<CampaignWithItemsResponseDto> {
    return this.campaignFeatureService.getById(
      tenant,
      id,
    ) as unknown as Promise<CampaignWithItemsResponseDto>;
  }

  @Get(':id/progress')
  @ApiOperation({
    summary: 'Campaign progress (goal / pledged / raised, with per-item breakdown)',
  })
  @ApiOkResponse({ type: CampaignProgressResponseDto })
  async progress(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ): Promise<CampaignProgressResponseDto> {
    return this.campaignFeatureService.progress(tenant, id);
  }

  @TenantRoles('ADMIN')
  @Patch(':id')
  @ApiOperation({ summary: 'Update a campaign' })
  @ApiOkResponse({ type: CampaignResponseDto })
  async update(
    @CurrentUser() user: AuthUser,
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() body: UpdateCampaignRequestDto,
  ): Promise<CampaignResponseDto> {
    return this.campaignFeatureService.update(
      user,
      tenant,
      id,
      body,
    ) as unknown as Promise<CampaignResponseDto>;
  }

  @TenantRoles('ADMIN')
  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete a campaign' })
  @ApiOkResponse({ type: DeleteResponseDto })
  async delete(
    @CurrentUser() user: AuthUser,
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ): Promise<DeleteResponseDto> {
    const deleted = await this.campaignFeatureService.delete(user, tenant, id);
    return { id: deleted.id };
  }

  @TenantRoles('ADMIN')
  @Post(':id/restore')
  @ApiOperation({ summary: 'Restore a soft-deleted campaign' })
  @ApiOkResponse({ type: CampaignResponseDto })
  async restore(
    @CurrentUser() user: AuthUser,
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ): Promise<CampaignResponseDto> {
    return this.campaignFeatureService.restore(
      user,
      tenant,
      id,
    ) as unknown as Promise<CampaignResponseDto>;
  }

  @TenantRoles('ADMIN')
  @Post(':id/items')
  @ApiOperation({ summary: 'Add a breakdown item to a campaign' })
  @ApiCreatedResponse({ type: CampaignItemResponseDto })
  async addItem(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') campaignId: string,
    @Body() body: CreateCampaignItemRequestDto,
  ): Promise<CampaignItemResponseDto> {
    return this.campaignFeatureService.addItem(
      tenant,
      campaignId,
      body,
    ) as unknown as Promise<CampaignItemResponseDto>;
  }

  @TenantRoles('ADMIN')
  @Patch(':id/items/:itemId')
  @ApiOperation({ summary: 'Update a campaign item' })
  @ApiOkResponse({ type: CampaignItemResponseDto })
  async updateItem(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') campaignId: string,
    @Param('itemId') itemId: string,
    @Body() body: UpdateCampaignItemRequestDto,
  ): Promise<CampaignItemResponseDto> {
    return this.campaignFeatureService.updateItem(
      tenant,
      campaignId,
      itemId,
      body,
    ) as unknown as Promise<CampaignItemResponseDto>;
  }

  @TenantRoles('ADMIN')
  @Delete(':id/items/:itemId')
  @ApiOperation({ summary: 'Soft-delete a campaign item' })
  @ApiOkResponse({ type: DeleteResponseDto })
  async deleteItem(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') campaignId: string,
    @Param('itemId') itemId: string,
  ): Promise<DeleteResponseDto> {
    const deleted = await this.campaignFeatureService.deleteItem(
      tenant,
      campaignId,
      itemId,
    );
    return { id: deleted.id };
  }
}
