import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { Public } from '@infrastructure/firebase-auth/decorators/public.decorator';
import dayjs from '@shared/dayjs';

@ApiTags('health')
@Controller()
export class MainController {
  @Public()
  @Get('health')
  health(): { status: 'ok'; timestamp: string } {
    return { status: 'ok', timestamp: dayjs().toISOString() };
  }
}
