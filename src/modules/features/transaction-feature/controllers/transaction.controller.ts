import { CurrentTenant } from "@infrastructure/firebase-auth/decorators/current-tenant.decorator";
import { CurrentUser } from "@infrastructure/firebase-auth/decorators/current-user.decorator";
import { TenantRoles } from "@infrastructure/firebase-auth/decorators/roles.decorator";
import { TenantGuard } from "@infrastructure/firebase-auth/guards/tenant.guard";
import type {
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

import type {
	CreateTransactionRequestDto,
	TransactionFiltersRequestDto,
	UpdateTransactionRequestDto,
} from "../dto/transaction.request.dto";
import {
	TransactionListResponseDto,
	TransactionResponseDto,
	TransactionSummaryResponseDto,
} from "../dto/transaction.response.dto";
import type { TransactionFeatureService } from "../services/transaction-feature.service";

@ApiTags("transactions")
@ApiBearerAuth("Bearer")
@ApiParam({ name: "tenantId", description: "Tenant UUID or slug" })
@UseGuards(TenantGuard)
@Controller("tenants/:tenantId/transactions")
export class TransactionController {
	constructor(
		private readonly transactionFeatureService: TransactionFeatureService,
	) {}

	@TenantRoles("ADMIN")
	@Post()
	@ApiOperation({ summary: "Record an incoming transaction" })
	@ApiCreatedResponse({ type: TransactionResponseDto })
	async create(
		@CurrentUser() user: AuthUser,
		@CurrentTenant() tenant: TenantContext,
		@Body() body: CreateTransactionRequestDto,
	): Promise<TransactionResponseDto> {
		return this.transactionFeatureService.record(
			user,
			tenant,
			body,
		) as unknown as Promise<TransactionResponseDto>;
	}

	@Get()
	@ApiOperation({
		summary: "List transactions",
		description:
			"Members see only their own; admins and super-admins see all within the tenant.",
	})
	@ApiOkResponse({ type: TransactionListResponseDto })
	async list(
		@CurrentTenant() tenant: TenantContext,
		@Query() filters: TransactionFiltersRequestDto,
	): Promise<TransactionListResponseDto> {
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
	@TenantRoles("ADMIN")
	@ApiOperation({
		summary: "Aggregate transaction totals for the admin dashboard",
		description:
			"Returns totals-by-type and a monthly trend for the last 12 months. Restricted to admins.",
	})
	@ApiOkResponse({ type: TransactionSummaryResponseDto })
	async summary(
		@CurrentTenant() tenant: TenantContext,
		@Query("months") months?: string,
	): Promise<TransactionSummaryResponseDto> {
		return this.transactionFeatureService.summary(
			tenant,
			months ? Number(months) : undefined,
		) as unknown as Promise<TransactionSummaryResponseDto>;
	}

	@Get(":id")
	@ApiOperation({ summary: "Get a transaction by id" })
	@ApiOkResponse({ type: TransactionResponseDto })
	async getById(
		@CurrentTenant() tenant: TenantContext,
		@Param("id") id: string,
	): Promise<TransactionResponseDto> {
		return this.transactionFeatureService.getById(
			tenant,
			id,
		) as unknown as Promise<TransactionResponseDto>;
	}

	@TenantRoles("ADMIN")
	@Patch(":id")
	@ApiOperation({ summary: "Update a transaction" })
	@ApiOkResponse({ type: TransactionResponseDto })
	async update(
		@CurrentUser() user: AuthUser,
		@CurrentTenant() tenant: TenantContext,
		@Param("id") id: string,
		@Body() body: UpdateTransactionRequestDto,
	): Promise<TransactionResponseDto> {
		return this.transactionFeatureService.update(
			user,
			tenant,
			id,
			body,
		) as unknown as Promise<TransactionResponseDto>;
	}

	@TenantRoles("ADMIN")
	@Delete(":id")
	@ApiOperation({ summary: "Soft-delete a transaction" })
	@ApiOkResponse({ type: DeleteResponseDto })
	async delete(
		@CurrentUser() user: AuthUser,
		@CurrentTenant() tenant: TenantContext,
		@Param("id") id: string,
	): Promise<DeleteResponseDto> {
		const deleted = await this.transactionFeatureService.delete(
			user,
			tenant,
			id,
		);
		return { id: deleted.id };
	}
}
