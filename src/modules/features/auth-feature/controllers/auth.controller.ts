import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { CurrentUser } from '@infrastructure/firebase-auth/decorators/current-user.decorator';
import { Public } from '@infrastructure/firebase-auth/decorators/public.decorator';
import type { AuthUser } from '@infrastructure/firebase-auth/types/auth-user.type';

import { ExchangeTokenRequestDto } from '../dto/exchange-token.dto';
import {
  AuthMeResponseDto,
  SessionResponseDto,
} from '../dto/session-response.dto';
import { AuthFeatureService } from '../services/auth-feature.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authFeatureService: AuthFeatureService) {}

  @Public()
  @Post('session')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Exchange a Firebase ID token for an application session',
    description:
      'Verifies the Firebase ID token, upserts the global User row, snapshots every tenant membership into custom claims, and returns the populated session.',
  })
  @ApiBody({ type: ExchangeTokenRequestDto })
  @ApiOkResponse({ type: SessionResponseDto })
  async createSession(@Body() body: ExchangeTokenRequestDto): Promise<SessionResponseDto> {
    return this.authFeatureService.exchangeIdToken(
      body.idToken,
    ) as unknown as Promise<SessionResponseDto>;
  }

  @ApiBearerAuth('Bearer')
  @Get('me')
  @ApiOperation({
    summary: 'Return the decoded Firebase token for the current request',
    description:
      'Shape mirrors the normalised AuthUser, including the tenantMemberships claim keyed by tenant slug.',
  })
  @ApiOkResponse({ type: AuthMeResponseDto })
  me(@CurrentUser() user: AuthUser): AuthMeResponseDto {
    return user as AuthMeResponseDto;
  }
}
