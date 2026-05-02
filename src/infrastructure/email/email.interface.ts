// Minimal provider-agnostic email surface. Implementations sit in this
// folder (e.g. resend.provider.ts) and are wired behind the EMAIL_PROVIDER
// token so the rest of the app talks to an interface, not a vendor.

export interface SendEmailInput {
	to: string;
	subject: string;
	html: string;
	text?: string;
	replyTo?: string;
}

export interface IEmailProvider {
	send(input: SendEmailInput): Promise<void>;
}

export const EMAIL_PROVIDER = Symbol("IEmailProvider");
