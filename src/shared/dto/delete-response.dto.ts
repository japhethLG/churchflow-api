import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

import { ID_EXAMPLE } from '../dto-examples';

export class DeleteResponseDto {
  @Expose()
  @ApiProperty({ example: ID_EXAMPLE })
  id!: string;
}
