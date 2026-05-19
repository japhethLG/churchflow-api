import {
	type AppAbility,
	asSubject,
	assertCan,
	CurrentAbility,
} from "@infrastructure/authorization";
import { CurrentTenant } from "@infrastructure/firebase-auth/decorators/current-tenant.decorator";
import { TenantGuard } from "@infrastructure/firebase-auth/guards/tenant.guard";
import { TenantContext } from "@infrastructure/firebase-auth/types/auth-user.type";
import {
	Controller,
	Get,
	NotFoundException,
	Param,
	Query,
	UseGuards,
} from "@nestjs/common";
import {
	ApiBearerAuth,
	ApiOkResponse,
	ApiOperation,
	ApiParam,
	ApiTags,
} from "@nestjs/swagger";

import { TransactionFeatureService } from "../../services/transaction-feature.service";
import { MyTransactionFiltersRequestDto } from "./requests";
import {
	MyTransactionListResponseDto,
	MyTransactionResponseDto,
} from "./responses";

// Self-service intent for transactions. Read-only — members do not create
// or edit transactions; the church's books are maintained by admins via
// the tenant endpoints.
@ApiTags("transactions (self)")
@ApiBearerAuth("Bearer")
@ApiParam({
	name: "tenantId",
	type: String,
	description: "Tenant UUID or slug",
})
@UseGuards(TenantGuard)
@Controller("tenants/:tenantId/me/transactions")
export class TransactionSelfController {
	constructor(
		private readonly transactionFeatureService: TransactionFeatureService,
	) {}

	@Get()
	@ApiOperation({ summary: "List the authenticated member's own transactions" })
	@ApiOkResponse({ type: MyTransactionListResponseDto })
	async list(
		@CurrentTenant() tenant: TenantContext,
		@CurrentAbility() ability: AppAbility,
		@Query() filters: MyTransactionFiltersRequestDto,
	): Promise<MyTransactionListResponseDto> {
		const memberId = this.requireMemberContext(tenant);
		assertCan(ability, "read", asSubject("Transaction", { memberId }));
		const result = await this.transactionFeatureService.list(tenant, {
			...filters,
			memberId,
		});
		return {
			items: result.items as unknown as MyTransactionResponseDto[],
			meta: {
				offset: filters.offset ?? 0,
				limit: filters.limit ?? result.items.length,
				total: result.total,
				sum: result.sum,
			},
		};
	}

	@Get(":id")
	@ApiOperation({
		summary: "Get one of the authenticated member's own transactions",
	})
	@ApiOkResponse({ type: MyTransactionResponseDto })
	async getById(
		@CurrentTenant() tenant: TenantContext,
		@CurrentAbility() ability: AppAbility,
		@Param("id") id: string,
	): Promise<MyTransactionResponseDto> {
		this.requireMemberContext(tenant);
		const tx = await this.transactionFeatureService.getById(tenant, id);
		assertCan(ability, "read", asSubject("Transaction", tx));
		return tx as unknown as MyTransactionResponseDto;
	}

	private requireMemberContext(tenant: TenantContext): string {
		if (!tenant.memberId) {
			throw new NotFoundException(
				"No member context for the authenticated user in this tenant",
			);
		}
		return tenant.memberId;
	}
}
