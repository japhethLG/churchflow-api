import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

import { TOKEN_EXAMPLE } from '@shared/dto-examples';

export class ExchangeTokenRequestDto {
  @ApiProperty({
    example: TOKEN_EXAMPLE,
    description: 'Firebase ID token obtained from the client SDK after Google sign-in',
  })
  @IsString()
  idToken!: string;
}
