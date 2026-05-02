import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { IEmailProvider, SendEmailInput } from "./email.interface";

// Resend provider. Uses the HTTP API directly to avoid pulling the full
// SDK (NestJS + SWC is fussy about ESM-only deps).
@Injectable()
export class ResendEmailProvider implements IEmailProvider {
	private readonly logger = new Logger("Email:resend");
	private readonly apiKey: string;
	private readonly from: string;

	constructor(config: ConfigService) {
		const apiKey = config.get<string>("RESEND_API_KEY");
		if (!apiKey) {
			throw new Error("RESEND_API_KEY is not defined");
		}
		this.apiKey = apiKey;

		const from = config.get<string>("RESEND_FROM_EMAIL");
		if (!from) {
			throw new Error("RESEND_FROM_EMAIL is not defined");
		}
		this.from = from;
	}

	async send(input: SendEmailInput): Promise<void> {
		const res = await fetch("https://api.resend.com/emails", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${this.apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				from: this.from,
				to: [input.to],
				subject: input.subject,
				html: input.html,
				text: input.text,
				reply_to: input.replyTo,
			}),
		});

		if (!res.ok) {
			const body = await res.text().catch(() => "");
			this.logger.error(`resend send failed (${res.status}): ${body}`);
			throw new Error(`Resend API returned ${res.status}`);
		}
	}
}
