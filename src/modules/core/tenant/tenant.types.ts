export interface CreateTenantInput {
  slug: string;
  name: string;
  createdBy: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  logoUrl?: string | null;
  currency?: string;
  timezone?: string;
  fiscalYearStart?: number;
  customTransactionTypes?: string[];
}

// Note: `slug` is deliberately not included here. The super-admin can
// rename a slug via a dedicated endpoint (with redirect alias handling),
// but the normal update path treats it as immutable.
export interface UpdateTenantInput {
  name?: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  logoUrl?: string | null;
  currency?: string;
  timezone?: string;
  fiscalYearStart?: number;
  customTransactionTypes?: string[];
}
