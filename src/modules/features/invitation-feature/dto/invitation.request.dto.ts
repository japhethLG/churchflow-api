import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsOptional, IsString } from 'class-validator';

import { MemberRole } from '@prisma/client';

import { EMAIL_EXAMPLE, ID_EXAMPLE, TOKEN_EXAMPLE } from '@shared/dto-examples';

export class IssueInvitationRequestDto {
  @ApiProperty({ example: EMAIL_EXAMPLE })
  @IsEmail()
  email!: string;

  @ApiProperty({ enum: MemberRole, example: MemberRole.USER })
  @IsEnum(MemberRole)
  role!: MemberRole;

  @ApiPropertyOptional({
    example: ID_EXAMPLE,
    description: 'Existing temp member to link to when this invitation is accepted',
  })
  @IsOptional()
  @IsString()
  memberId?: string;
}

export class AcceptInvitationRequestDto {
  @ApiProperty({ example: TOKEN_EXAMPLE })
  @IsString()
  token!: string;
}
