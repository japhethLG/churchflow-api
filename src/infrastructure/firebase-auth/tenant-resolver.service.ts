import { PrismaClientService } from "@infrastructure/prisma-client/prisma-client.service";
import { CACHE_MANAGER, type Cache } from "@nestjs/cache-manager";
import { Inject, Injectable } from "@nestjs/common";

export interface ResolvedTenant {
	id: string;
	slug: string;
}

// How long a slug/id → {id, slug} resolution is trusted. Slugs change
// rarely and mutations invalidate explicitly (see invalidate()), so this
// is just a safety net against a missed invalidation. Short enough that
// any drift self-heals within a navigation or two.
const RESOLVE_TTL_MS = 60_000;

// Resolves a tenant by URL identifier (slug or UUID) for TenantGuard,
// backed by a short-TTL cache. Lives in infrastructure (uses
// PrismaClientService directly, like TenantGuard did) so it doesn't open
// an Infra → Core hole. The guard runs on every /tenants/:tenantId/*
// request, and the client fan-out fires several of those per navigation —
// without the cache that's one identical tenant lookup per parallel call.
@Injectable()
export class TenantResolverService {
	constructor(
		private readonly prisma: PrismaClientService,
		@Inject(CACHE_MANAGER) private readonly cache: Cache,
	) {}

	// Returns the active tenant matching `idOrSlug`, or null. Tombstoned
	// tenants are excluded by the soft-delete extension (findFirst injects
	// `deletedAt: null`), so the cache never serves an archived tenant.
	async resolve(idOrSlug: string): Promise<ResolvedTenant | null> {
		const key = this.cacheKey(idOrSlug);
		const cached = await this.cache.get<ResolvedTenant>(key);
		if (cached) {
			return cached;
		}

		// Slug-first: the FE always sends a slug, which hits the unique
		// index in a single seek instead of the previous id-OR-slug bitmap.
		// findFirst (not findUnique) because the partial-unique slug index
		// allows a tombstone to share the slug of an active row.
		const bySlug = await this.prisma.tenant.findFirst({
			where: { slug: idOrSlug },
			select: { id: true, slug: true },
		});
		const tenant =
			bySlug ??
			(await this.prisma.tenant.findFirst({
				where: { id: idOrSlug },
				select: { id: true, slug: true },
			}));

		if (tenant) {
			await this.cache.set(key, tenant, RESOLVE_TTL_MS);
		}
		return tenant;
	}

	// Clears cached resolutions for the given keys. Call with both the slug
	// and the id (and, on a slug change, the previous slug) whenever a
	// tenant is created with / renamed to / deleted under those keys.
	async invalidate(
		...idsOrSlugs: Array<string | null | undefined>
	): Promise<void> {
		await Promise.all(
			idsOrSlugs
				.filter((k): k is string => Boolean(k))
				.map((k) => this.cache.del(this.cacheKey(k))),
		);
	}

	private cacheKey(idOrSlug: string): string {
		return `tenant:resolve:${idOrSlug}`;
	}
}
