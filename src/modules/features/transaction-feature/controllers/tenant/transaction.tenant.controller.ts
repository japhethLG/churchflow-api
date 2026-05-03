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
	ApiTags,
} from "@nestjs/swagger";
import { DeleteResponseDto } from "@shared/dto/delete-response.dto";

import { TransactionFeatureService } from "../../services/transaction-feature.service";
import {
	CreateTransactionRequestDto,
	TransactionFiltersRequestDto,
	UpdateTransactionRequestDto,
} from "./requests";
import {
	TransactionListResponseDto,
	TransactionResponseDto,
	TransactionSummaryResponseDto,
} from "./responses";

// Tenant-management intent for transactions. Available to admins (and
// super-admins via TenantGuard pass-through). Members read their own
// transactions through /me/transactions instead. Members cannot create or
// edit transactions — those are recorded by admins as the church's books.
@ApiTags("transactions (tenant)")
@ApiBearerAuth("Bearer")
@ApiParam({ name: "tenantId", description: "Tenant UUID or slug" })
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
			"Returns totals-by-type and a monthly trend for the last 12 months. Restricted to admins.",
	})
	@ApiOkResponse({ type: TransactionSummaryResponseDto })
	async summary(
		@CurrentTenant() tenant: TenantContext,
		@CurrentAbility() ability: AppAbility,
		@Query("months") months?: string,
	): Promise<TransactionSummaryResponseDto> {
		assertCan(ability, "read", "Transaction");
		return this.transactionFeatureService.summary(
			tenant,
			months ? Number(months) : undefined,
		) as unknown as Promise<TransactionSummaryResponseDto>;
	}

	@Get(":id")
	@ApiOperation({ summary: "Get a transaction by id (admin only)" })
	@ApiOkResponse({ type: TransactionResponseDto })
	async getById(
		@CurrentTenant() tenant: TenantContext,
		@CurrentAbility() ability: AppAbility,
		@Param("id") id: string,
	): Promise<TransactionResponseDto> {
		const tx = await this.transactionFeatureService.getById(tenant, id);
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
}
