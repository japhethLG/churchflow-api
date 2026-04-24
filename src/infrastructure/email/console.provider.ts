import { Injectable, Logger } from '@nestjs/common';

import type { IEmailProvider, SendEmailInput } from './email.interface';

// Fallback provider when no real email is configured. Logs the email to
// the console instead of sending — useful in local dev without Resend
// credentials, or in tests.
@Injectable()
export class ConsoleEmailProvider implements IEmailProvider {
  private readonly logger = new Logger('Email:console');

  async send(input: SendEmailInput): Promise<void> {
    this.logger.log(
      `[dev] to=${input.to} subject="${input.subject}" body=${input.text ?? input.html.slice(0, 200)}`,
    );
  }
}
