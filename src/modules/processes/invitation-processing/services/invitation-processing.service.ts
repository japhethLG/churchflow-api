import { randomUUID } from "node:crypto";
import {
	EMAIL_PROVIDER,
	type IEmailProvider,
} from "@infrastructure/email/email.interface";
import type { UserClaimsService } from "@infrastructure/firebase-auth/user-claims.service";
import type { AuditService } from "@modules/core/audit/services/audit.service";
import type { InvitationService } from "@modules/core/invitation/services/invitation.service";
import type { MemberService } from "@modules/core/member/services/member.service";
import type { TenantService } from "@modules/core/tenant/services/tenant.service";
import type { UserService } from "@modules/core/user/services/user.service";
import {
	BadRequestException,
	ConflictException,
	ForbiddenException,
	Inject,
	Injectable,
	Logger,
} from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import {
	AuditAction,
	type Invitation,
	InvitationStatus,
	MemberRole,
} from "@prisma/client";
import dayjs from "@shared/dayjs";

const INVITATION_TTL_DAYS = 7;

// Rate-limit: at most 20 invitations per tenant per hour. Prevents
// spammy/runaway admin behaviour and keeps email provider costs bounded.
const INVITATION_RATE_WINDOW_MS = 60 * 60 * 1000;
const INVITATION_RATE_MAX = 20;

export interface IssueInvitationInput {
	tenantId: string;
	email: string;
	role: MemberRole;
	invitedBy: string;
	memberId?: string;
}

@Injectable()
export class InvitationProcessingService {
	private readonly logger = new Logger(InvitationProcessingService.name);

	constructor(
    private readonly invitationService: InvitationService,
    private readonly memberService: MemberService,
    private readonly userService: UserService,
    private readonly tenantService: TenantService,
    private readonly userClaims: UserClaimsService,
    private readonly auditService: AuditService,
    private readonly config: ConfigService,
    @Inject(EMAIL_PROVIDER) private readonly email: IEmailProvider,
  ) {}

	async issue(input: IssueInvitationInput): Promise<Invitation> {
		const tenant = await this.tenantService.getById(input.tenantId);

		// Rate limit.
		const recent = await this.invitationService.countRecentForTenant(
			input.tenantId,
			INVITATION_RATE_WINDOW_MS,
		);
		if (recent >= INVITATION_RATE_MAX) {
			throw new ForbiddenException(
				"Invitation rate limit exceeded for this church. Try again in an hour.",
			);
		}

		// De-dup: if there's a pending invite for the same email + tenant,
		// reject rather than silently replacing.
		const existing = await this.invitationService.findPendingByTenantAndEmail(
			input.tenantId,
			input.email,
		);
		if (existing) {
			throw new ConflictException(
				"A pending invitation already exists for this email in this church.",
			);
		}

		// If memberId is set, the invite is "claim this temp profile". Validate
		// it: must belong to this tenant, must not already be linked to a user.
		// Throws 404 if missing — getById is tenant-scoped.
		if (input.memberId) {
			const member = await this.memberService.getById(
				input.tenantId,
				input.memberId,
			);
			if (member.userId) {
				throw new ConflictException(
					"This member is already linked to a user account; nothing to claim.",
				);
			}
		}

		const token = randomUUID();
		const expiresAt = dayjs().add(INVITATION_TTL_DAYS, "day").toDate();

		const invitation = await this.invitationService.create({
			tenantId: input.tenantId,
			email: input.email,
			role: input.role,
			invitedBy: input.invitedBy,
			memberId: input.memberId,
			token,
			expiresAt,
		});

		await this.sendInvitationEmail(invitation, tenant.name, tenant.slug);

		await this.auditService.record({
			tenantId: input.tenantId,
			actorUid: input.invitedBy,
			action: AuditAction.CREATE,
			entity: "Invitation",
			entityId: invitation.id,
			summary: `Invited ${input.email} as ${input.role}`,
		});

		return invitation;
	}

	async accept(token: string, firebaseUid: string): Promise<Invitation> {
		const invitation = await this.invitationService.getByToken(token);

		if (invitation.status !== InvitationStatus.PENDING) {
			throw new BadRequestException("Invitation is no longer pending");
		}

		if (dayjs(invitation.expiresAt).isBefore(dayjs())) {
			await this.invitationService.markExpired(invitation.id);
			throw new BadRequestException("Invitation expired");
		}

		const user = await this.userService.findByFirebaseUid(firebaseUid);
		if (!user)
			throw new BadRequestException(
				"User profile must exist before accepting invitation",
			);

		if (invitation.memberId) {
			// Claim flow. Link the existing temp Member to the signed-in user
			// and overwrite the email with the verified SSO address — the temp
			// email was admin-entered and can drift; SSO is authoritative.
			// Other fields (name/phone/address) are reconciled by the user
			// themselves on the welcome onboarding screen.
			await this.memberService.linkUser(
				invitation.tenantId,
				invitation.memberId,
				user.id,
			);
			await this.memberService.update(
				invitation.tenantId,
				invitation.memberId,
				{
					email: user.email,
				},
			);
		} else {
			await this.memberService.create({
				tenantId: invitation.tenantId,
				userId: user.id,
				createdBy: invitation.invitedBy,
				firstName: user.displayName.split(" ")[0] ?? user.displayName,
				lastName:
					user.displayName.split(" ").slice(1).join(" ") || user.displayName,
				email: user.email,
				role: invitation.role,
			});
		}

		const accepted = await this.invitationService.markAccepted(invitation.id);

		// Rebuild custom claims so the user's next token refresh picks up
		// their new membership. Frontend calls refreshSession() right after
		// accept to materialise this into a new session cookie.
		await this.userClaims.refreshFor(firebaseUid);

		await this.auditService.record({
			tenantId: invitation.tenantId,
			actorUid: firebaseUid,
			actorEmail: user.email,
			action: AuditAction.MEMBERSHIP_CHANGE,
			entity: "Invitation",
			entityId: invitation.id,
			summary: `Invitation accepted by ${user.email}`,
		});

		return accepted;
	}

	async cancel(token: string, actorUid: string): Promise<Invitation> {
		const invitation = await this.invitationService.getByToken(token);
		const cancelled = await this.invitationService.markCancelled(invitation.id);

		await this.auditService.record({
			tenantId: invitation.tenantId,
			actorUid,
			action: AuditAction.DELETE,
			entity: "Invitation",
			entityId: invitation.id,
			summary: "Invitation cancelled",
		});

		return cancelled;
	}

	async cancelById(
		tenantId: string,
		invitationId: string,
		actorUid: string,
	): Promise<Invitation> {
		const invitation = await this.invitationService.getById(invitationId);

		if (invitation.tenantId !== tenantId) {
			throw new ForbiddenException("Invitation does not belong to this tenant");
		}

		if (invitation.status !== InvitationStatus.PENDING) {
			throw new BadRequestException("Invitation is no longer pending");
		}

		const cancelled = await this.invitationService.markCancelled(invitation.id);

		await this.auditService.record({
			tenantId: invitation.tenantId,
			actorUid,
			action: AuditAction.DELETE,
			entity: "Invitation",
			entityId: invitation.id,
			summary: `Invitation to ${invitation.email} cancelled`,
		});

		return cancelled;
	}

	async listPending(tenantId: string): Promise<Invitation[]> {
		return this.invitationService.findPendingForTenant(tenantId);
	}

	// Public lookup for the acceptance page — so the invitee sees the
	// church name before signing in. Returns the invitation without
	// side effects; does not expose the raw token details beyond what's
	// needed to render the page.
	async lookup(
		token: string,
	): Promise<
		Invitation & {
			tenantName: string;
			tenantSlug: string;
			inviterDisplayName: string | null;
		}
	> {
		const invitation = await this.invitationService.getByToken(token);
		if (invitation.status !== InvitationStatus.PENDING) {
			throw new BadRequestException("Invitation is no longer pending");
		}
		if (dayjs(invitation.expiresAt).isBefore(dayjs())) {
			throw new BadRequestException("Invitation expired");
		}
		const [tenant, inviter] = await Promise.all([
			this.tenantService.getById(invitation.tenantId),
			this.userService.findByFirebaseUid(invitation.invitedBy),
		]);
		return {
			...invitation,
			tenantName: tenant.name,
			tenantSlug: tenant.slug,
			inviterDisplayName: inviter?.displayName ?? null,
		};
	}

	private async sendInvitationEmail(
		invitation: Invitation,
		tenantName: string,
		tenantSlug: string,
	): Promise<void> {
		const appUrl =
			this.config.get<string>("APP_URL") ?? "http://localhost:3000";
		const link = `${appUrl}/invite/${invitation.token}`;

		const subject = `You've been invited to ${tenantName}`;
		const html = `
      <p>Hi,</p>
      <p>You've been invited to join <strong>${escapeHtml(tenantName)}</strong> on ChurchFlow as ${invitation.role === MemberRole.ADMIN ? "an admin" : "a member"}.</p>
      <p><a href="${link}">Click here to accept the invitation</a></p>
      <p>This link expires on ${dayjs(invitation.expiresAt).format("YYYY-MM-DD")}.</p>
      <p>If you weren't expecting this email, you can ignore it.</p>
      <p style="color:#888;font-size:12px">Tenant: ${tenantSlug}</p>
    `;
		const text = `You've been invited to ${tenantName} on ChurchFlow. Accept: ${link} (expires ${dayjs(invitation.expiresAt).format("YYYY-MM-DD")})`;

		try {
			await this.email.send({ to: invitation.email, subject, html, text });
		} catch (err) {
			// Email failures are non-fatal — the admin can reshare the link
			// directly. Log so operators know something is wrong with the
			// provider.
			this.logger.error(`invitation email failed: ${(err as Error).message}`);
		}
	}
}

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}
