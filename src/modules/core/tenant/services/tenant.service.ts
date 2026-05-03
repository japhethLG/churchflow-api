import {
	BadRequestException,
	ConflictException,
	Injectable,
	NotFoundException,
} from "@nestjs/common";

import { Tenant } from "@prisma/client";

import { TenantRepository } from "../repository/tenant.repository";
import { CreateTenantInput, UpdateTenantInput } from "../tenant.types";

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/;
const RESERVED_SLUGS = new Set([
	"api",
	"admin",
	"login",
	"logout",
	"invite",
	"member",
	"super-admin",
	"select-church",
	"www",
	"app",
	"docs",
]);

@Injectable()
export class TenantService {
	constructor(private readonly tenantRepository: TenantRepository) {}

	async create(data: CreateTenantInput): Promise<Tenant> {
		this.assertValidSlug(data.slug);
		if (await this.tenantRepository.slugExists(data.slug)) {
			throw new ConflictException(`Slug "${data.slug}" is already taken`);
		}
		return this.tenantRepository.create(data);
	}

	async getById(id: string): Promise<Tenant> {
		const tenant = await this.tenantRepository.findById(id);
		if (!tenant) {
			throw new NotFoundException(`Tenant not found: ${id}`);
		}
		return tenant;
	}

	async getBySlug(slug: string): Promise<Tenant> {
		const tenant = await this.tenantRepository.findBySlug(slug);
		if (!tenant) {
			throw new NotFoundException(`Tenant not found: ${slug}`);
		}
		return tenant;
	}

	// Accepts either the UUID or the slug. Used by TenantGuard so
	// controllers don't care which form the caller used.
	async getByIdOrSlug(idOrSlug: string): Promise<Tenant> {
		const tenant = await this.tenantRepository.findByIdOrSlug(idOrSlug);
		if (!tenant) {
			throw new NotFoundException(`Tenant not found: ${idOrSlug}`);
		}
		return tenant;
	}

	async getAll(): Promise<Tenant[]> {
		return this.tenantRepository.findAll();
	}

	async getAllForUser(userId: string) {
		return this.tenantRepository.findAllForUser(userId);
	}

	async update(id: string, data: UpdateTenantInput): Promise<Tenant> {
		await this.getById(id);
		return this.tenantRepository.update(id, data);
	}

	async rename(id: string, newSlug: string): Promise<Tenant> {
		await this.getById(id);
		this.assertValidSlug(newSlug);
		if (await this.tenantRepository.slugExists(newSlug)) {
			throw new ConflictException(`Slug "${newSlug}" is already taken`);
		}
		return this.tenantRepository.updateSlug(id, newSlug);
	}

	async delete(id: string): Promise<Tenant> {
		await this.getById(id);
		return this.tenantRepository.softDelete(id);
	}

	async restore(id: string): Promise<Tenant> {
		const existing = await this.tenantRepository.findByIdOrSlug(id);
		if (existing) {
			return existing;
		}
		return this.tenantRepository.restore(id);
	}

	// Produces a URL-safe slug from the given name. Strips non-alphanumerics,
	// collapses dashes. Caller is still responsible for uniqueness checks
	// (which the create() call enforces).
	static suggestSlug(name: string): string {
		return (
			name
				.trim()
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, "-")
				.replace(/^-+|-+$/g, "")
				.slice(0, 48) || "church"
		);
	}

	private assertValidSlug(slug: string): void {
		if (!SLUG_PATTERN.test(slug)) {
			throw new BadRequestException(
				"Slug must be 3-64 chars, lowercase alphanumerics and hyphens only, and cannot start or end with a hyphen.",
			);
		}
		if (RESERVED_SLUGS.has(slug)) {
			throw new BadRequestException(`Slug "${slug}" is reserved.`);
		}
	}
}
