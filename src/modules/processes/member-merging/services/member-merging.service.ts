import { UserClaimsService } from "@infrastructure/firebase-auth/user-claims.service";
import { AuditService } from "@modules/core/audit/services/audit.service";
import { MemberService } from "@modules/core/member/services/member.service";
import { PledgeService } from "@modules/core/pledge/services/pledge.service";
import { TransactionService } from "@modules/core/transaction/services/transaction.service";
import { UserService } from "@modules/core/user/services/user.service";
import {
	BadRequestException,
	ConflictException,
	Injectable,
} from "@nestjs/common";
import { AuditAction, type Member } from "@prisma/client";

export interface MergeMembersInput {
	tenantId: string;
	keepId: string;
	dropId: string;
	// Firebase UID — recorded in the audit event for the merge.
	actorUid: string;
	// Internal User.id — stamped onto the dropped member's `deletedBy`.
	// Null when the firebase UID has no corresponding User row (super-
	// admin acting without a member row, etc.).
	actorId: string | null;
	actorEmail?: string;
}

export interface MergePreview {
	keep: Member;
	drop: Member;
	transactionsToMove: number;
	pledgesToMove: number;
	// Fields the keep row is missing that the drop row has — these will be
	// copied over when the merge executes.
	fieldsCopiedFromDrop: Array<"email" | "phone" | "address" | "userId">;
}

export interface MergeResult extends MergePreview {
	merged: Member;
}

@Injectable()
export class MemberMergingService {
	constructor(
		private readonly memberService: MemberService,
		private readonly transactionService: TransactionService,
		private readonly pledgeService: PledgeService,
		private readonly userService: UserService,
		private readonly userClaims: UserClaimsService,
		private readonly auditService: AuditService,
	) {}

	// Dry-run for the merge UI: shows the admin exactly what will move and
	// which fields will be copied. No mutations.
	async preview(
		input: Omit<MergeMembersInput, "actorUid" | "actorId" | "actorEmail">,
	): Promise<MergePreview> {
		const { keep, drop } = await this.loadAndValidate(
			input.tenantId,
			input.keepId,
			input.dropId,
		);

		// Use filters to get accurate counts. Limit 0 returns just the totals.
		const [txs, pledges] = await Promise.all([
			this.transactionService.getAll(input.tenantId, {
				memberId: drop.id,
				limit: 0,
			}),
			this.pledgeService.getAll(input.tenantId, {
				memberId: drop.id,
				limit: 0,
			}),
		]);

		return {
			keep,
			drop,
			transactionsToMove: txs.total,
			pledgesToMove: pledges.total,
			fieldsCopiedFromDrop: collectFieldsToCopy(keep, drop),
		};
	}

	// Move all transactions + pledges from drop → keep, copy any fields the
	// keep row is missing, then soft-delete drop. Audit logged on both sides.
	async merge(input: MergeMembersInput): Promise<MergeResult> {
		const { keep, drop } = await this.loadAndValidate(
			input.tenantId,
			input.keepId,
			input.dropId,
		);

		const fieldsToCopy = collectFieldsToCopy(keep, drop);

		const [transactionsToMove, pledgesToMove] = await Promise.all([
			this.transactionService.reassignMember(input.tenantId, drop.id, keep.id),
			this.pledgeService.reassignMember(input.tenantId, drop.id, keep.id),
		]);

		// Patch keep with anything drop had and keep didn't.
		const patch: Record<string, unknown> = {};
		for (const field of fieldsToCopy) {
			patch[field] = (drop as unknown as Record<string, unknown>)[field];
		}
		const merged = Object.keys(patch).length
			? await this.memberService.update(input.tenantId, keep.id, patch)
			: keep;

		// Soft-delete the dropped member.
		await this.memberService.delete(input.tenantId, drop.id, input.actorId);

		// If the dropped row was linked to a user, that user's tenantMemberships
		// claims now point at a soft-deleted member — refresh so they pick up
		// the keep memberId on next token refresh.
		if (drop.userId) {
			const linkedUser = await this.userService.findById(drop.userId);
			if (linkedUser) {
				await this.userClaims.refreshFor(linkedUser.firebaseUid);
			}
		}
		// Same for keep when its userId got copied from drop.
		if (patch.userId && merged.userId && merged.userId !== keep.userId) {
			const linkedUser = await this.userService.findById(
				merged.userId as string,
			);
			if (linkedUser) {
				await this.userClaims.refreshFor(linkedUser.firebaseUid);
			}
		}

		await this.auditService.record({
			tenantId: input.tenantId,
			actorUid: input.actorUid,
			actorEmail: input.actorEmail,
			action: AuditAction.UPDATE,
			entity: "Member",
			entityId: keep.id,
			summary: `Merged member ${drop.firstName} ${drop.lastName} (${drop.id}) into ${keep.firstName} ${keep.lastName}: ${transactionsToMove} txns, ${pledgesToMove} pledges`,
			diff: {
				keep: { id: keep.id },
				drop: { id: drop.id },
				transactionsToMove,
				pledgesToMove,
				fieldsCopied: fieldsToCopy,
			},
		});

		return {
			keep: merged,
			drop,
			transactionsToMove,
			pledgesToMove,
			fieldsCopiedFromDrop: fieldsToCopy,
			merged,
		};
	}

	private async loadAndValidate(
		tenantId: string,
		keepId: string,
		dropId: string,
	): Promise<{ keep: Member; drop: Member }> {
		if (keepId === dropId) {
			throw new BadRequestException("Cannot merge a member into itself");
		}
		const [keep, drop] = await Promise.all([
			this.memberService.getById(tenantId, keepId),
			this.memberService.getById(tenantId, dropId),
		]);

		// If both have linked users we cannot merge without choosing which
		// user identity wins — refuse and let the admin sort it out manually.
		if (keep.userId && drop.userId && keep.userId !== drop.userId) {
			throw new ConflictException(
				"Both members are linked to different user accounts. Unlink one before merging.",
			);
		}

		return { keep, drop };
	}
}

function collectFieldsToCopy(
	keep: Member,
	drop: Member,
): Array<"email" | "phone" | "address" | "userId"> {
	const fields: Array<"email" | "phone" | "address" | "userId"> = [];
	if (!keep.email && drop.email) {
		fields.push("email");
	}
	if (!keep.phone && drop.phone) {
		fields.push("phone");
	}
	if (!keep.address && drop.address) {
		fields.push("address");
	}
	if (!keep.userId && drop.userId) {
		fields.push("userId");
	}
	return fields;
}
