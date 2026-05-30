# Church App Backend

Multi-tenant church management API. Tracks incoming financial transactions
(tithes, offerings, mission giving, first fruit, commitments, donations) and
runs pledge-based fundraising campaigns (building funds, mission trips)
broken into line items members can commit to individually.

This repo is the API for the sibling Next.js frontend at `../church-app/`.
The product spec lives in [`../church-app/SPECS.md`](../church-app/SPECS.md). 

## Stack

- **NestJS 11** + **TypeScript 5.6** (SWC build via `nest-cli`)
- **PostgreSQL** with **Prisma 7** (multi-file schema + `@prisma/adapter-pg`)
- **Firebase Admin** for auth — ID-token verification + custom claims only
- **CASL** (`@casl/ability` + `@casl/prisma`) for authorization, with a
  single `ability.factory.ts` as the source of truth
- **`@nestjs/swagger` + `@scalar/nestjs-api-reference`** for API docs
- **`class-validator` / `class-transformer`** at the HTTP boundary
- **`nodemailer`** with Gmail / Resend / console providers (auto-selected
  from env vars)
- **`@nestjs/cache-manager`** — global in-memory `CacheModule` backing
  tenant slug resolution + platform stats
- **`compression`** — gzip on responses (`main.ts`)
- **Biome 2** for lint + format
- **Vitest + Testcontainers** for integration tests (real Postgres, no mocks)

## Setup

```bash
# 1. Install
npm install

# 2. Configure env (DATABASE_URL + Firebase service account)
cp .env.example .env

# 3. Generate Prisma client + run migrations
npm run prisma:generate
npm run prisma:migrate

# 4. (Optional) seed a super-admin user
npm run seed:super-admin

# 5. Start dev server
npm run start:dev

# 6. (Optional) run the integration suite — requires Docker
npm run test:integration
```

Optional performance tunables (sensible defaults; see [`.env.example`](.env.example)):
`AUTH_VERIFY_CACHE_TTL_MS` (auth-verify cache, default 30000), the
`DATABASE_POOL_*` / `DATABASE_STATEMENT_TIMEOUT_MS` pg-pool knobs, and
`DISABLE_HTTP_COMPRESSION=true` when fronted by a compressing proxy.

API runs on `http://localhost:8000/api/v1/`.

| Endpoint | Purpose |
|---|---|
| `http://localhost:8000/api-docs` | Scalar API reference (interactive) |
| `http://localhost:8000/api-docs-json` | Raw OpenAPI 3.x JSON — frontend codegen reads this |
| `http://localhost:8000/api/v1/health` | Liveness probe |

The docs paths are intentionally **not** under `/api`. The frontend regenerates
its TypeScript types via `openapi-typescript` against `/api-docs-json` — at
build time against the **live production** spec, so Swagger stays mounted in
prod (don't guard it off) and a release that **adds** endpoints must deploy the
**backend before the frontend**.

## Architecture — 5-tier (Griffin-derived)

Dependencies only flow downward. Anything sideways within a layer is a
smell.

```
Main      → Feature, Process, Core, Infra
Feature   → Process, Core, Infra
Process   → Core, Infra
Core      → Infra (never another Core)
Infra     → external adapters only
```

| Layer | Responsibility | Has |
|-------|----------------|-----|
| **Main** | Wires every module + global guards/interceptors | `main.module.ts`, `main.ts` |
| **Feature** | HTTP-facing workflow — controllers, request/response DTOs, orchestration | controllers, services, intent-split DTOs |
| **Process** | Reusable multi-step orchestration shared by features | services only — no controllers |
| **Core** | Single-entity CRUD (one Prisma table per module) | service, repository, internal `*.types.ts` |
| **Infra** | DB, Firebase, CASL, email — anything outside our database | service / module / decorators / guards |

Cross-cutting authorization rules live in **CASL**
([`infrastructure/authorization/ability.factory.ts`](src/infrastructure/authorization/ability.factory.ts)) —
the only place "who can do what" is decided. Controllers call
`assertCan(ability, action, subject)` to enforce.

## Directory layout

```
prisma/
├── schema/                 # Prisma 7 multi-file schema (auto-merged at build)
│   ├── schema.prisma       # generator + datasource only
│   ├── user.prisma
│   ├── tenant.prisma
│   ├── member.prisma       # Member + MemberRole + MemberStatus
│   ├── campaign.prisma     # Campaign + CampaignItem + CampaignStatus
│   ├── pledge.prisma       # Pledge + PledgeStatus
│   ├── transaction.prisma  # Transaction + TransactionType + PaymentMethod
│   ├── invitation.prisma   # Invitation + InvitationStatus
│   └── audit.prisma        # AuditEvent (append-only)
├── migrations/
└── seed.ts

scripts/
└── seed-super-admin.ts     # promote a user to SUPER_ADMIN

src/
├── main.ts                 # bootstrap — /api, v1, CORS, gzip (compression),
│                           #   request-timing LoggingInterceptor, ValidationPipe, Scalar docs
├── main.module.ts          # wires every layer + global APP_GUARDs
├── main.controller.ts      # /health
│
├── infrastructure/
│   ├── prisma-client/      # PrismaClientService (PrismaPg adapter)
│   ├── firebase-auth/      # FirebaseAdminService, UserClaimsService, guards, decorators
│   ├── authorization/      # CASL — AbilityFactory, AbilityInterceptor, assertCan, etc.
│   ├── config/interceptors/  # GlobalResponseInterceptor + ClaimsRefreshInterceptor
│   └── email/              # IEmailProvider — console / Gmail / Resend (auto-selected)
│
├── shared/
│   ├── dto-examples.ts     # @ApiProperty example constants — single source of truth
│   └── dto/                # one response DTO per Prisma entity
│
└── modules/
    ├── core/               # Layer 1 — one folder per Prisma entity
    │   ├── user/  tenant/  member/  campaign/  campaign-item/
    │   ├── pledge/  transaction/  invitation/  audit/
    │   └── … each has services/, repository/, <entity>.types.ts
    │
    ├── processes/          # Layer 2 — reusable multi-step orchestration
    │   ├── invitation-processing/
    │   └── member-merging/
    │
    └── features/           # Layer 3 — HTTP-facing
        ├── auth-feature/        # exempt from intent split (legacy dto/ shape)
        ├── admin-feature/       # platform/ only (super-admin tools)
        ├── tenant-feature/      # platform/ + tenant/ + self/
        ├── member-feature/      # tenant/ + self/
        ├── campaign-feature/    # tenant/ + self/
        ├── pledge-feature/      # tenant/ + self/
        ├── transaction-feature/ # tenant/ + self/
        └── invitation-feature/  # tenant/ + public/  (token lookup/accept)
```

### Intent-split feature folders

Controllers are organized by **URL intent**, not by role. The URL prefix
declares scope; CASL enforces authorization.

```
features/<name>-feature/
├── controllers/
│   ├── platform/           # /platform/<resource>  — super-admin only
│   ├── tenant/             # /tenants/:tenantId/<resource>  — admin tenant-management
│   ├── self/               # /tenants/:tenantId/me/<resource>  — member self-service
│   └── public/             # /<resource>/...  — token-based / unauthenticated
│       ├── requests/       # one request DTO class per file + index.ts barrel
│       ├── responses/      # one response DTO class per file + index.ts barrel
│       ├── decorators/     # placeholder when empty
│       ├── <entity>.<intent>.controller.ts
│       └── index.ts
├── services/<name>-feature.service.ts   # unified, no role branches
└── <name>-feature.module.ts
```

The feature **service is unified** — authorization happens at the
controller boundary via `assertCan(...)`, so the service trusts
pre-authorized inputs and never branches on role.

## Domain model

```
Campaign (e.g. building fund, mission trip)
│  - no stored goal — the goal is the SUM of its items' targetAmount
│  - deadline optional (null = open-ended)
│
├── CampaignItem (roofing, gates, …)
│     - targetAmount
│     - deadline optional (null = inherit campaign.deadline)
│
├── Pledge (member commits to give)
│     - campaignItemId optional (null = general pledge to the campaign)
│     - pledgedAmount
│
└── Transaction (actual payment)
      - pledgeId optional — when set, campaignId/campaignItemId must match the pledge
      - campaignItemId requires campaignId
      - both optional — transactions can exist without campaign attribution
```

When recording a transaction, if `pledgeId` is set it fully determines
`campaignId` and `campaignItemId`; the transaction feature service
rejects caller-supplied mismatches.

## Authentication & authorization

**Firebase for auth, CASL for authorization** — no Firestore, no FCM, no
storage.

The active tenant is **derived from the URL** (`/tenants/:tenantId/...`,
where `:tenantId` accepts a UUID OR a slug), not stored on the token.
A user's Firebase token carries:

```ts
interface AuthUser {
  firebaseUid: string;
  email: string;
  displayName?: string;
  picture?: string;
  isSuperAdmin: boolean;
  tenantMemberships: Record<string, {              // keyed by tenant slug
    memberId: string;
    role: "ADMIN" | "USER";
    name: string;                                  // tenant display name
  }>;
}
```

### Request pipeline

1. **`FirebaseAuthGuard`** (global `APP_GUARD`) — verifies the bearer
   token, populates `req.user`. Bypassed on `@Public()` handlers. The
   `checkRevoked` verify is **short-TTL cached** (a navigation's parallel
   requests share one Firebase round-trip), so the guard does **not** hit
   Firebase on every request — see [authentication caching](#caching).
2. **`RolesGuard`** (global `APP_GUARD`) — enforces
   `@Roles('SUPER_ADMIN')` against `user.isSuperAdmin`.
3. **`TenantGuard`** (opt-in `@UseGuards(TenantGuard)` on
   `/tenants/:tenantId/...` routes) — resolves the tenant (UUID or slug)
   via the cached `TenantResolverService`, verifies membership (or
   super-admin), optionally enforces `@TenantRoles('ADMIN')`, and writes
   `req.tenant: TenantContext`.
4. **`AbilityInterceptor`** (global `APP_INTERCEPTOR`) — builds the
   request-scoped `AppAbility` from `req.tenant` (or from
   `user.isSuperAdmin` for platform routes).
5. Controllers inject `@CurrentAbility()` and call
   `assertCan(ability, action, subject)`.

### Auth endpoints

| Method | Path | Notes |
|---|---|---|
| `POST` | `/auth/session` | `@Public()` — exchange ID token, snapshot memberships into custom claims |
| `GET`  | `/auth/me` | Return the decoded `AuthUser` |
| `POST` | `/auth/sign-out-everywhere` | Revoke every refresh token for the caller |

There is **no `switch-tenant`** — that endpoint was retired when the
active tenant moved into the URL. Membership claims are refreshed on every
sign-in by `UserClaimsService`. Mid-session, when a handler mutates the
caller's own membership/role/super-admin state, it should be tagged
`@RefreshesClaims()` — `ClaimsRefreshInterceptor` then sets
`X-Claims-Refreshed: 1` on the response, which the frontend reacts to by
forcing a token refresh and re-minting its session cookie.

### Caching

Three short-TTL caches keep the hot path off the network/DB:

- **Auth verify** — `FirebaseAdminService` caches successful
  `verifyIdToken` / `verifySessionCookie` results (still
  `checkRevoked=true`), keyed by a hash of the credential
  (`AUTH_VERIFY_CACHE_TTL_MS`, default 30s). `signOutEverywhere()` drops
  the uid's entries immediately so revocation is instant.
- **Tenant resolution** — `TenantResolverService` (used by `TenantGuard`)
  caches the slug-first `:tenantId` lookup (~60s); `tenant-feature.service`
  invalidates on tenant rename/delete/restore.
- **Platform stats** — `AdminFeatureService` memoizes platform stats
  (~60s), busted on mutation.

The latter two ride the global `@nestjs/cache-manager` `CacheModule`. See
[CLAUDE.md §9.6](CLAUDE.md).

## DTO conventions

Because the OpenAPI JSON is the contract with the frontend, DTOs need
correct decorators on every field. We split DTOs into three tiers and
deliberately **never share controller-level DTOs across modules**:

| Tier | Location | Purpose | Validators? |
|------|----------|---------|-------------|
| **Shared base** | `src/shared/dto/<entity>.dto.ts` | One response DTO per Prisma entity | ❌ |
| **Feature request** | `controllers/<intent>/requests/<verb>-<entity>.request.ts` | HTTP input | ✅ |
| **Feature response** | `controllers/<intent>/responses/<entity>.response.ts` | HTTP output (usually `extends SharedDto`) | ❌ |

Core layer uses plain TS interfaces (`<entity>.types.ts`) as internal
service contracts — no `class-validator` decorators below the HTTP
boundary.

Example shapes are pulled from
[`src/shared/dto-examples.ts`](src/shared/dto-examples.ts) so they stay
consistent. `Decimal` columns are transformed to `number` so JSON output
isn't a `Prisma.Decimal` object.

Self-intent DTOs use a `My...` prefix
(`MyPledgeResponseDto`, `MyPledgeFiltersRequestDto`) and **must omit
`memberId`** — the controller forces it from `tenant.memberId`.

**Shared filter bases.** The recurring query-string contracts —
soft-delete state flags, inclusive date range, offset/limit pagination —
live in `src/shared/dto/` as three small base classes
(`StateFilterRequestDto`, `DateRangeRequestDto`, `PaginationRequestDto`).
Concrete list-filter DTOs compose them via `IntersectionType` from
`@nestjs/swagger`; if you need to tighten one inherited field (e.g.
`@Max(200)` on `limit`), use `OmitType` to drop it before redeclaring.
Each DTO comment names the column its date range brackets — typically
`createdAt`, except `transactions` which uses `Transaction.date`. See
[CLAUDE.md §7.7](CLAUDE.md#77-shared-filter-base-dtos--compose-dont-redeclare).

## Audit trail

Mutating actions write an append-only `AuditEvent` row via `AuditService`.
Each row carries `tenantId` (or null for platform-level events),
`actorUid`, `action` (`CREATE | UPDATE | DELETE | RESTORE | ROLE_CHANGE |
MEMBERSHIP_CHANGE`), `entity`, `entityId`, an optional summary string and
a JSON `diff`. Feature services are responsible for shaping the diff.

## Email

[`infrastructure/email/`](src/infrastructure/email/) exposes a single
`IEmailProvider` token. At boot, `EmailModule` picks the provider based on
env vars:

1. `GMAIL_APP_PASSWORD` set → `GmailEmailProvider`
2. `RESEND_API_KEY` set → `ResendEmailProvider`
3. otherwise → `ConsoleEmailProvider` (logs to stdout — for dev/tests)

Consumers inject `@Inject(EMAIL_PROVIDER) IEmailProvider` and call
`send({ to, subject, html, text?, replyTo? })`.

## Date handling

Always use **dayjs** via `@shared/dayjs` (preloaded with the UTC plugin).
Never use `new Date()` or `Date.now()`. When persisting to a Prisma
`DateTime` field, convert with `dayjs(val).toDate()`.

## Build & lint

- **SWC** via `nest-cli` (`-b swc`, `typeCheck: true`) — see
  [`.swcrc`](.swcrc) and [`nest-cli.json`](nest-cli.json).
- **Biome** for lint + format — `npm run lint`, `npm run format`,
  `npm run check`.

## Testing

Integration tests live in [`test/integration/`](test/integration/) and
run against a real Postgres container spun up by **Testcontainers**.
The same `PrismaClientService` (with the soft-delete extension wired in)
is used end-to-end — no mocks at the database layer.

```bash
npm run test:integration         # one-shot — boots Postgres, runs migrations, runs tests
npm run test:integration:watch   # vitest watch mode
```

First run pulls `postgres:16-alpine`; subsequent runs reuse the cached
image and complete in ~10 seconds. Requires Docker.

## Soft delete

Every soft-deletable entity has `deletedAt` / `deletedBy` /
`deletedByCascade` columns. A Prisma extension at
[`src/infrastructure/prisma-client/soft-delete/`](src/infrastructure/prisma-client/soft-delete/)
filters tombstones from every read by default (top-level reads, relation
includes, `_count`, relation predicates inside `where` — including
`AND`/`OR`/`NOT` and `some`/`every`/`none`), and blocks writes against
tombstoned rows.

Soft-delete operations live in the repository layer. Each soft-deletable
entity exposes a three-layer flow:

```text
Feature service           → entityService.delete(tenantId, id, user.firebaseUid)
Core service              → entityRepository.softDelete(tenantId, id, actorId)
Core repository           → wraps softDelete(tx, "Model", { where, actorId }) in $transaction
```

The repo's `softDelete` cascades through composition relations
(`@relation(onDelete: Cascade)`) and stamps `deletedBy` /
`deletedByCascade`. `restore` mirrors this and undoes only the
cascade-deleted descendants, preserving independently-archived rows.

To opt back in to tombstones — for historical views, receipts, audit
queries — wrap the read in `withDeleted` inside a repo method:

```ts
// In your repository — features/services don't call withDeleted directly.
async findManyIncludingDeleted(tenantId: string) {
  return this.prisma.member.findMany(
    withDeleted("Member", {
      where: { tenantId },
      include: { pledges: { include: { campaign: true } } },
    }),
  );
}
```

See [CLAUDE.md §8.3](CLAUDE.md) for the full design (Prisma constraints,
cascade semantics, partial unique indexes for slot reclamation,
anti-patterns).

## Adding a new module

See [CLAUDE.md](CLAUDE.md) §10 for the full step-by-step. In short:

- **Core** (new entity): schema → migrate → shared DTO → core module
  (`types.ts` + repository + service + module exporting the service) →
  register in `main.module.ts` `coreModules` → add to `AppSubjects` and
  `ability.factory.ts` if the entity needs authorization.
- **Process** (reusable multi-step): only when more than one feature will
  trigger it; otherwise keep the flow inside the feature service.
- **Feature** (new HTTP workflow): create the intent-split skeleton
  (`controllers/{platform,tenant,self,public}/{requests,responses,decorators}/`),
  unified service, register in `main.module.ts` `featureModules`.

The full architectural rules, anti-patterns, and decorator cheat sheets
live in [CLAUDE.md](CLAUDE.md). Read it before non-trivial edits.
