import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { ConsoleEmailProvider } from "./console.provider";
import { EMAIL_PROVIDER } from "./email.interface";
import { GmailEmailProvider } from "./gmail.provider";
import { ResendEmailProvider } from "./resend.provider";

// Global email module. Picks an IEmailProvider at startup based on which
// env vars are set:
//   1. GMAIL_APP_PASSWORD → GmailEmailProvider  (free, 500/day)
//   2. RESEND_API_KEY     → ResendEmailProvider  (paid)
//   3. (neither)          → ConsoleEmailProvider  (dev / tests)
// Consumers inject `@Inject(EMAIL_PROVIDER) IEmailProvider`.
@Global()
@Module({
	providers: [
		ConsoleEmailProvider,
		// Conditionally instantiate only the provider that's configured to
		// avoid boot errors from missing env vars.
		{
			provide: GmailEmailProvider,
			inject: [ConfigService],
			useFactory: (config: ConfigService) => {
				if (config.get<string>("GMAIL_APP_PASSWORD")) {
					return new GmailEmailProvider(config);
				}
				return null;
			},
		},
		{
			provide: ResendEmailProvider,
			inject: [ConfigService],
			useFactory: (config: ConfigService) => {
				if (config.get<string>("RESEND_API_KEY")) {
					return new ResendEmailProvider(config);
				}
				return null;
			},
		},
		{
			provide: EMAIL_PROVIDER,
			inject: [
				ConfigService,
				GmailEmailProvider,
				ResendEmailProvider,
				ConsoleEmailProvider,
			],
			useFactory: (
				config: ConfigService,
				gmail: GmailEmailProvider | null,
				resend: ResendEmailProvider | null,
				console: ConsoleEmailProvider,
			) => {
				if (config.get<string>("GMAIL_APP_PASSWORD") && gmail) {
					return gmail;
				}
				if (config.get<string>("RESEND_API_KEY") && resend) {
					return resend;
				}
				return console;
			},
		},
	],
	exports: [EMAIL_PROVIDER],
})
export class EmailModule {}
