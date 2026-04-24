import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ConsoleEmailProvider } from './console.provider';
import { EMAIL_PROVIDER } from './email.interface';
import { ResendEmailProvider } from './resend.provider';

// Global email module. Picks an IEmailProvider at startup: Resend if
// RESEND_API_KEY is set, otherwise ConsoleEmailProvider (dev / tests).
// Consumers inject `@Inject(EMAIL_PROVIDER) IEmailProvider`.
@Global()
@Module({
  providers: [
    ConsoleEmailProvider,
    ResendEmailProvider,
    {
      provide: EMAIL_PROVIDER,
      inject: [ConfigService, ResendEmailProvider, ConsoleEmailProvider],
      useFactory: (
        config: ConfigService,
        resend: ResendEmailProvider,
        console: ConsoleEmailProvider,
      ) => {
        return config.get<string>('RESEND_API_KEY') ? resend : console;
      },
    },
  ],
  exports: [EMAIL_PROVIDER],
})
export class EmailModule {}
