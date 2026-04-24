import {
  Body,
  Controller,
  Get,
  Param,
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
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';

import { CurrentTenant } from '@infrastructure/firebase-auth/decorators/current-tenant.decorator';
import { CurrentUser } from '@infrastructure/firebase-auth/decorators/current-user.decorator';
import { Public } from '@infrastructure/firebase-auth/decorators/public.decorator';
import { TenantRoles } from '@infrastructure/firebase-auth/decorators/roles.decorator';
import { TenantGuard } from '@infrastructure/firebase-auth/guards/tenant.guard';
import type {
  AuthUser,
  TenantContext,
} from '@infrastructure/firebase-auth/types/auth-user.type';

import { InvitationProcessingService } from '@modules/processes/invitation-processing/services/invitation-processing.service';

import {
  AcceptInvitationRequestDto,
  IssueInvitationRequestDto,
} from '../dto/invitation.request.dto';
import {
  InvitationListResponseDto,
  InvitationResponseDto,
} from '../dto/invitation.response.dto';

@ApiTags('invitations')
@Controller()
export class InvitationController {
  constructor(private readonly invitationProcessing: InvitationProcessingService) {}

  @ApiBearerAuth('Bearer')
  @TenantRoles('ADMIN')
  @UseGuards(TenantGuard)
  @Post('tenants/:tenantId/invitations')
  @ApiOperation({ summary: 'Issue an invitation to a member or admin (admin only)' })
  @ApiParam({ name: 'tenantId', description: 'Tenant UUID or slug' })
  @ApiCreatedResponse({ type: InvitationResponseDto })
  async issue(
    @CurrentUser() user: AuthUser,
    @CurrentTenant() tenant: TenantContext,
    @Body() body: IssueInvitationRequestDto,
  ): Promise<InvitationResponseDto> {
    return this.invitationProcessing.issue({
      tenantId: tenant.tenantId,
      email: body.email,
      role: body.role,
      memberId: body.memberId,
      invitedBy: user.firebaseUid,
    }) as unknown as Promise<InvitationResponseDto>;
  }

  @ApiBearerAuth('Bearer')
  @UseGuards(TenantGuard)
  @Get('tenants/:tenantId/invitations')
  @TenantRoles('ADMIN')
  @ApiOperation({ summary: 'List pending invitations for a tenant (admin only)' })
  @ApiParam({ name: 'tenantId', description: 'Tenant UUID or slug' })
  @ApiOkResponse({ type: InvitationListResponseDto })
  async list(
    @CurrentTenant() tenant: TenantContext,
  ): Promise<InvitationListResponseDto> {
    const items = await this.invitationProcessing.listPending(tenant.tenantId);
    return { items: items as unknown as InvitationResponseDto[] };
  }

  // Public token lookup. Members will hit this from the invitation link
  // before they're signed in, to display "You've been invited to Grace
  // Community" without forcing sign-in first.
  @Public()
  @Get('invitations/lookup')
  @ApiOperation({ summary: 'Look up an invitation by token (public)' })
  @ApiQuery({ name: 'token' })
  @ApiOkResponse({ type: InvitationResponseDto })
  async lookup(@Query('token') token: string): Promise<InvitationResponseDto> {
    return this.invitationProcessing.lookup(token) as unknown as Promise<InvitationResponseDto>;
  }

  @ApiBearerAuth('Bearer')
  @Post('invitations/accept')
  @ApiOperation({ summary: 'Accept an invitation using the token emailed to the invitee' })
  @ApiOkResponse({ type: InvitationResponseDto })
  async accept(
    @CurrentUser() user: AuthUser,
    @Body() body: AcceptInvitationRequestDto,
  ): Promise<InvitationResponseDto> {
    return this.invitationProcessing.accept(
      body.token,
      user.firebaseUid,
    ) as unknown as Promise<InvitationResponseDto>;
  }
}
