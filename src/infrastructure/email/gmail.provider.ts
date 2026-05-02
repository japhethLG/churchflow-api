import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as nodemailer from "nodemailer";

import {  IEmailProvider, SendEmailInput  } from "./email.interface";

// Gmail SMTP provider. Uses nodemailer with a Gmail App Password for
// authentication. Free tier allows ~500 emails/day which is plenty for
// most church apps. Requires 2-Step Verification + App Password on the
// Google account.
@Injectable()
export class GmailEmailProvider implements IEmailProvider {
	private readonly logger = new Logger("Email:gmail");
	private readonly transporter: nodemailer.Transporter;
	private readonly from: string;

	constructor(config: ConfigService) {
		const user = config.get<string>("GMAIL_USER");
		if (!user) {
			throw new Error("GMAIL_USER is not defined");
		}

		const pass = config.get<string>("GMAIL_APP_PASSWORD");
		if (!pass) {
			throw new Error("GMAIL_APP_PASSWORD is not defined");
		}

		this.from = config.get<string>("GMAIL_FROM_NAME")
			? `${config.get<string>("GMAIL_FROM_NAME")} <${user}>`
			: user;

		this.transporter = nodemailer.createTransport({
			service: "Gmail",
			auth: { user, pass },
		});

		this.logger.log(`Gmail SMTP configured for ${user}`);
	}

	async send(input: SendEmailInput): Promise<void> {
		try {
			const info = await this.transporter.sendMail({
				from: this.from,
				to: input.to,
				subject: input.subject,
				html: input.html,
				text: input.text,
				replyTo: input.replyTo,
			});

			this.logger.debug(`Email sent: ${info.messageId}`);
		} catch (err) {
			this.logger.error(`Gmail send failed: ${(err as Error).message}`);
			throw err;
		}
	}
}
