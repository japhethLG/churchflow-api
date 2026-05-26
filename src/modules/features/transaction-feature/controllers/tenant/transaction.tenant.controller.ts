import {
	type AppAbility,
	asSubject,
	assertCan,
	CurrentAbility,
} from "@infrastructure/authorization";
import { CurrentTenant } from "@infrastructure/firebase-auth/decorators/current-tenant.decorator";
import { CurrentUser } from "@infrastructure/firebase-auth/decorators/current-user.decorator";
import { TenantGuard } from "@infrastructure/firebase-auth/guards/tenant.guard";
import {
	AuthUser,
	TenantContext,
} from "@infrastructure/firebase-auth/types/auth-user.type";
import {
	Body,
	Controller,
	Delete,
	Get,
	Param,
	Patch,
	Post,
	Query,
	UseGuards,
} from "@nestjs/common";
import {
	ApiBearerAuth,
	ApiCreatedResponse,
	ApiOkResponse,
	ApiOperation,
	ApiParam,
	ApiQuery,
	ApiTags,
} from "@nestjs/swagger";
import { DeleteResponseDto } from "@shared/dto/delete-response.dto";

import { TransactionFeatureService } from "../../services/transaction-feature.service";
import {
	BulkCreateTransactionsRequestDto,
	CreateTransactionRequestDto,
	GiversReportQueryRequestDto,
	TransactionFiltersRequestDto,
	TransactionSummaryQueryRequestDto,
	UnattributedSummaryQueryRequestDto,
	UpdateTransactionRequestDto,
} from "./requests";
import {
	GiversReportResponseDto,
	TransactionListResponseDto,
	TransactionResponseDto,
	TransactionSummaryResponseDto,
	UnattributedSummaryResponseDto,
} from "./responses";

// Tenant-management intent for transactions. Available to admins (and
// super-admins via TenantGuard pass-through). Members read their own
// transactions through /me/transactions instead. Members cannot create or
// edit transactions — those are recorded by admins as the church's books.
@ApiTags("transactions (tenant)")
@ApiBearerAuth("Bearer")
@ApiParam({
	name: "tenantId",
	type: String,
	description: "Tenant UUID or slug",
})
@UseGuards(TenantGuard)
@Controller("tenants/:tenantId/transactions")
export class TransactionTenantController {
	constructor(
		private readonly transactionFeatureService: TransactionFeatureService,
	) {}

	@Post()
	@ApiOperation({ summary: "Record an incoming transaction (admin only)" })
	@ApiCreatedResponse({ type: TransactionResponseDto })
	async create(
		@CurrentUser() user: AuthUser,
		@CurrentTenant() tenant: TenantContext,
		@CurrentAbility() ability: AppAbility,
		@Body() body: CreateTransactionRequestDto,
	): Promise<TransactionResponseDto> {
		assertCan(ability, "create", "Transaction");
		return this.transactionFeatureService.record(
			user,
			tenant,
			body,
		) as unknown as Promise<TransactionResponseDto>;
	}

	// Static "bulk" segment must be declared before the ":id" routes below
	// or Nest's matcher would treat "bulk" as an id.
	@Post("bulk")
	@ApiOperation({
		summary: "Record many gifts in one entry (admin only, atomic)",
		description:
			"Validates every row up front and writes the whole batch in a single Prisma transaction. Either all gifts are recorded or none are.",
	})
	@ApiCreatedResponse({ type: TransactionListResponseDto })
	async bulkCreate(
		@CurrentUser() user: AuthUser,
		@CurrentTenant() tenant: TenantContext,
		@CurrentAbility() ability: AppAbility,
		@Body() body: BulkCreateTransactionsRequestDto,
	): Promise<TransactionListResponseDto> {
		assertCan(ability, "create", "Transaction");
		const items = await this.transactionFeatureService.recordMany(
			user,
			tenant,
			body.items,
		);
		const sum = items.reduce((acc, tx) => acc + Number(tx.amount), 0);
		return {
			items: items as unknown as TransactionResponseDto[],
			meta: {
				offset: 0,
				limit: items.length,
				total: items.length,
				sum,
			},
		};
	}

	@Get()
	@ApiOperation({ summary: "List transactions across the tenant (admin only)" })
	@ApiOkResponse({ type: TransactionListResponseDto })
	async list(
		@CurrentTenant() tenant: TenantContext,
		@CurrentAbility() ability: AppAbility,
		@Query() filters: TransactionFiltersRequestDto,
	): Promise<TransactionListResponseDto> {
		assertCan(ability, "read", "Transaction");
		const result = await this.transactionFeatureService.list(tenant, filters);
		return {
			items: result.items as unknown as TransactionResponseDto[],
			meta: {
				offset: filters.offset ?? 0,
				limit: filters.limit ?? result.items.length,
				total: result.total,
				sum: result.sum,
			},
		};
	}

	@Get("summary")
	@ApiOperation({
		summary: "Aggregate transaction totals for the admin dashboard",
		description:
			"Returns totals, average, first/last gift dates, by-type breakdown, and a monthly trend. Respects the same filters as the list endpoint (type, campaign, member, soft-delete state) so the summary card cannot diverge from the table rows.",
	})
	@ApiOkResponse({ type: TransactionSummaryResponseDto })
	async summary(
		@CurrentTenant() tenant: TenantContext,
		@CurrentAbility() ability: AppAbility,
		@Query() query: TransactionSummaryQueryRequestDto,
	): Promise<TransactionSummaryResponseDto> {
		assertCan(ability, "read", "Transaction");
		return this.transactionFeatureService.summary(tenant, {
			dateFrom: query.dateFrom,
			dateTo: query.dateTo,
			months: query.months,
			lifetime: query.lifetime,
			memberId: query.memberId,
			campaignId: query.campaignId,
			type: query.type,
			includeDeleted: query.includeDeleted,
			onlyDeleted: query.onlyDeleted,
		}) as unknown as Promise<TransactionSummaryResponseDto>;
	}

	// Counts + totals of unattributed gifts (anonymous or no-campaign) in
	// the window. Powers the admin dashboard's UnattributedCallout.
	// Static segment — declared above the ":id" routes.
	@Get("unattributed")
	@ApiOperation({
		summary: "Unattributed gift counts and totals for the dashboard callout",
		description:
			"Server-side aggregation. Replaces the FE's previous fetch-500-and-count pattern, which silently truncated when traffic exceeded the limit.",
	})
	@ApiOkResponse({ type: UnattributedSummaryResponseDto })
	async unattributed(
		@CurrentTenant() tenant: TenantContext,
		@CurrentAbility() ability: AppAbility,
		@Query() query: UnattributedSummaryQueryRequestDto,
	): Promise<UnattributedSummaryResponseDto> {
		assertCan(ability, "read", "Transaction");
		const now = new Date();
		const defaultFrom = new Date(now);
		defaultFrom.setUTCDate(defaultFrom.getUTCDate() - 7);
		defaultFrom.setUTCHours(0, 0, 0, 0);
		const dateFrom = query.dateFrom ?? defaultFrom;
		const dateTo = query.dateTo ?? now;
		return this.transactionFeatureService.unattributedSummary(
			tenant,
			dateFrom,
			dateTo,
		) as unknown as Promise<UnattributedSummaryResponseDto>;
	}

	// Static "reports/givers" segment must be declared before the ":id"
	// routes below or Nest's matcher would treat "reports" as an id.
	@Get("reports/givers")
	@ApiOperation({
		summary: "Top-N givers report (admin Reports → Givers tab)",
		description:
			"Pre-aggregated server-side: ranks members by total amount in the window, returning per-member type / campaign / monthly breakdowns. Replaces the FE's fetch-all-transactions-and-reduce pattern.",
	})
	@ApiOkResponse({ type: GiversReportResponseDto })
	async giversReport(
		@CurrentTenant() tenant: TenantContext,
		@CurrentAbility() ability: AppAbility,
		@Query() query: GiversReportQueryRequestDto,
	): Promise<GiversReportResponseDto> {
		assertCan(ability, "read", "Transaction");
		const now = new Date();
		const defaultFrom = new Date(now);
		defaultFrom.setUTCMonth(defaultFrom.getUTCMonth() - 11);
		defaultFrom.setUTCDate(1);
		defaultFrom.setUTCHours(0, 0, 0, 0);
		const dateFrom = query.dateFrom ?? defaultFrom;
		const dateTo = query.dateTo ?? now;
		const limit = query.limit ?? 50;
		return this.transactionFeatureService.giversReport(
			tenant,
			dateFrom,
			dateTo,
			limit,
		) as unknown as Promise<GiversReportResponseDto>;
	}

	@Get(":id")
	@ApiOperation({ summary: "Get a transaction by id (admin only)" })
	@ApiQuery({
		name: "includeDeleted",
		required: false,
		type: Boolean,
		description:
			"Return the transaction even if soft-deleted (banner-style archived view).",
	})
	@ApiOkResponse({ type: TransactionResponseDto })
	async getById(
		@CurrentTenant() tenant: TenantContext,
		@CurrentAbility() ability: AppAbility,
		@Param("id") id: string,
		@Query("includeDeleted") includeDeleted?: boolean,
	): Promise<TransactionResponseDto> {
		const tx = await this.transactionFeatureService.getById(tenant, id, {
			includeDeleted,
		});
		assertCan(ability, "read", asSubject("Transaction", tx));
		return tx as unknown as TransactionResponseDto;
	}

	@Patch(":id")
	@ApiOperation({ summary: "Update a transaction (admin only)" })
	@ApiOkResponse({ type: TransactionResponseDto })
	async update(
		@CurrentUser() user: AuthUser,
		@CurrentTenant() tenant: TenantContext,
		@CurrentAbility() ability: AppAbility,
		@Param("id") id: string,
		@Body() body: UpdateTransactionRequestDto,
	): Promise<TransactionResponseDto> {
		const existing = await this.transactionFeatureService.getById(tenant, id);
		assertCan(ability, "update", asSubject("Transaction", existing));
		return this.transactionFeatureService.update(
			user,
			tenant,
			id,
			body,
		) as unknown as Promise<TransactionResponseDto>;
	}

	@Delete(":id")
	@ApiOperation({ summary: "Soft-delete a transaction (admin only)" })
	@ApiOkResponse({ type: DeleteResponseDto })
	async delete(
		@CurrentUser() user: AuthUser,
		@CurrentTenant() tenant: TenantContext,
		@CurrentAbility() ability: AppAbility,
		@Param("id") id: string,
	): Promise<DeleteResponseDto> {
		const existing = await this.transactionFeatureService.getById(tenant, id);
		assertCan(ability, "delete", asSubject("Transaction", existing));
		const deleted = await this.transactionFeatureService.delete(
			user,
			tenant,
			id,
		);
		return { id: deleted.id };
	}

	@Post(":id/restore")
	@ApiOperation({ summary: "Restore a soft-deleted transaction (admin only)" })
	@ApiOkResponse({ type: TransactionResponseDto })
	async restore(
		@CurrentUser() user: AuthUser,
		@CurrentTenant() tenant: TenantContext,
		@CurrentAbility() ability: AppAbility,
		@Param("id") id: string,
	): Promise<TransactionResponseDto> {
		assertCan(ability, "restore", "Transaction");
		return this.transactionFeatureService.restore(
			user,
			tenant,
			id,
		) as unknown as Promise<TransactionResponseDto>;
	}
}
