# CLAUDE.md — Church App Backend Agent Guide

> **Audience:** AI coding agents (Claude Code, etc.) working on this codebase.
> **Goal:** Give you enough context to make changes without breaking the
> architecture, so you can confidently add modules, endpoints, or schema
> changes on your first try.
>
> Read this **before** editing any file. The rules below are enforced. If
> something in the codebase contradicts this guide, the codebase is wrong —
> fix it.

---

## 1. What this project is

A multi-tenant **church management API**. Each church (tenant) tracks
**incoming** financial transactions (tithes, offerings, mission giving, first
fruit, commitments, donations) and runs pledge-based fundraising campaigns.
No expense tracking. Each tenant's data is fully isolated.

- Admins manage members / campaigns / pledges / transactions within their church.
- Members see only their own transactions and pledges.
- Super admins onboard new churches and their first admin.

### Domain model

A **Campaign** (e.g. building fund) has **CampaignItems** that break the
overall goal into line items (roofing, gates). The campaign's goal is the
**sum** of its items' `targetAmount` — there is no stored `goalAmount`. A
**Pledge** is a member's commitment to give toward either the overall
campaign or a specific item. A **Transaction** is an actual payment that
can optionally reference a pledge, a campaign item, and/or a campaign; the
feature service enforces consistency (if `pledgeId` is given, it fully
determines `campaignId` and `campaignItemId`).

Deadlines: `Campaign.deadline` and `CampaignItem.deadline` are both
nullable. Null on a campaign = open-ended. Null on an item = inherit the
campaign's deadline (resolved in the API layer, not stored).

The full product spec lives in the sibling Next.js app's
[`../church-app/SPECS.md`](../church-app/SPECS.md). This repo is the backend
for that app.

---

## 2. Tech stack (exact versions)

| Layer | Tech | Notes |
|-------|------|-------|
| Framework | NestJS **11** | — |
| Language | TypeScript 5.6 | strict mode |
| Build | **SWC** via `nest-cli` (`-b swc`) | typeCheck on; see [.swcrc](.swcrc) |
| Database | PostgreSQL | — |
| ORM | Prisma **7** | multi-file schema under [prisma/schema/](prisma/schema/) |
| Prisma adapter | `@prisma/adapter-pg` | Prisma 7 requires `adapter` or `accelerateUrl` on the client |
| Auth | **Firebase Admin SDK** | ID-token verification + custom claims only — no other Firebase services |
| Authorization | **CASL** (`@casl/ability` + `@casl/prisma`) | Single source of truth in [`ability.factory.ts`](src/infrastructure/authorization/ability.factory.ts) |
| Email | `nodemailer` (Gmail / Resend / console) | Auto-selected at boot from env vars — see [`infrastructure/email/`](src/infrastructure/email/) |
| API docs | `@nestjs/swagger` + `@scalar/nestjs-api-reference` | Scalar UI at `/api-docs`, raw OpenAPI JSON at `/api-docs-json` |
| Validation | `class-validator` + `class-transformer` | global `ValidationPipe` with `whitelist: true, forbidNonWhitelisted: true, transform: true, enableImplicitConversion: true` |
| Lint / format | Biome 2 | `npm run lint` / `npm run format` / `npm run check` |

### Path aliases (both in `tsconfig.json` and `.swcrc`)

```
@infrastructure/*   → src/infrastructure/*
@modules/*          → src/modules/*
@shared/*           → src/shared/*
```

Always use these aliases. Never use deep relative imports (`../../../../shared/...`).

---

## 3. Commands cheat sheet

```bash
npm install                    # first-time install
cp .env.example .env           # fill in DATABASE_URL + Firebase creds
npm run prisma:generate        # regenerate Prisma client (run after schema edits)
npm run prisma:migrate         # create + apply dev migration
npm run prisma:deploy          # apply migrations in CI/prod (no schema diff)
npm run prisma:studio          # GUI DB browser
npm run prisma:seed            # tsx prisma/seed.ts
npm run seed:super-admin       # promote a user to SUPER_ADMIN (scripts/seed-super-admin.ts)
npm run start:dev              # SWC watch mode on :8000
npm run build                  # production build via SWC
npm run lint                   # biome lint .
npm run format                 # biome format . --write
npm run check                  # biome check --write .
npm run test:integration       # vitest — boots a Postgres testcontainer, applies migrations
npm run test:integration:watch # vitest watch mode
```

Docs: <http://localhost:8000/api-docs> (Scalar UI) · <http://localhost:8000/api-docs-json> (raw OpenAPI).

---

## 4. Architecture — the 5-tier rule

Adapted from the Griffin modular architecture. **Dependencies only flow
downward.** Every circular-dep or "god service" problem traces back to
breaking the rule below.

```text
┌─────────────────────────────────────────────────────┐
│  Layer 4 — Main (AppModule, root config)             │  can import Feature, Process, Core, Infra
├─────────────────────────────────────────────────────┤
│  Layer 3 — Feature (HTTP controllers + orchestration)│  can import Process, Core, Infra
├─────────────────────────────────────────────────────┤
│  Layer 2 — Process (reusable multi-step services)    │  can import Core, Infra
├─────────────────────────────────────────────────────┤
│  Layer 1 — Core (single-entity CRUD)                 │  can import Infra, Shared
├─────────────────────────────────────────────────────┤
│  Layer 0 — Infrastructure (DB, Firebase, etc.)       │  can import only Shared
└─────────────────────────────────────────────────────┘
```

### The laws (non-negotiable)

```
Main     → Feature, Process, Core, Infra       ✅
Feature  → Process, Core, Infra                 ✅
Process  → Core, Infra                          ✅
Core     → Infra, Shared                        ✅

Feature  → another Feature                      ❌
Feature  → Main                                 ❌
Process  → Feature, Main, another Process       ❌
Core     → another Core                         ❌❌❌ (MOST IMPORTANT)
Core     → Feature, Process                     ❌
Infra    → Feature, Process, Core               ❌
Shared   → anything non-shared                  ❌
```

**Why `Core` never imports another `Core`:** prevents the circular graph
that was the original sin (`invoice → payment → invoice`). If two entities
need each other, that's a *feature* or *process* joining them — not a core
module.

### Mental model

- **Feature:** "User clicked a button and now 5 things need to happen."
- **Process:** "These 3 steps always happen together regardless of who triggers them."
- **Core:** "I just need to read/write *one* table."
- **Infrastructure:** "I talk to something outside our database."

---

## 5. Directory layout (source of truth)

```
prisma/schema/              # Prisma 7 multi-file schema (auto-merged at build)
├── schema.prisma           # generator + datasource ONLY
├── user.prisma
├── tenant.prisma
├── member.prisma           # Member + MemberRole + MemberStatus
├── campaign.prisma         # Campaign + CampaignItem + CampaignStatus
├── pledge.prisma           # Pledge + PledgeStatus
├── transaction.prisma      # Transaction + TransactionType + PaymentMethod
├── invitation.prisma       # Invitation + InvitationStatus
└── audit.prisma            # AuditEvent + AuditAction (append-only audit log)

src/
├── main.ts                 # bootstrap — /api prefix, URI version v1, CORS (exposes
│                           #   X-Claims-Refreshed), ValidationPipe, ClaimsRefreshInterceptor
│                           #   + GlobalResponseInterceptor as global interceptors, Scalar docs
├── main.module.ts          # wires every layer + global APP_GUARDs
├── main.controller.ts      # /health
├── swagger.config.ts       # setupSwagger(app) — Scalar + /api-docs-json
│
├── infrastructure/         # Layer 0
│   ├── config/interceptors/
│   │   ├── global-response.interceptor.ts    # wraps responses in { success, data }
│   │   └── claims-refresh.interceptor.ts     # sets X-Claims-Refreshed: 1 (see §9.5)
│   ├── prisma-client/      # PrismaClientService (extends PrismaClient, uses PrismaPg adapter)
│   ├── firebase-auth/      # FirebaseAdminService + guards + decorators
│   │   ├── firebase-admin.service.ts
│   │   ├── user-claims.service.ts            # writes tenantMemberships+isSuperAdmin claims
│   │   ├── decorators/                       # @Public, @Roles, @TenantRoles,
│   │   │                                     #   @CurrentUser, @CurrentTenant, @RefreshesClaims
│   │   ├── guards/                           # FirebaseAuthGuard (global APP_GUARD),
│   │   │                                     #   RolesGuard (global APP_GUARD), TenantGuard
│   │   └── types/auth-user.type.ts           # AuthUser, TenantContext, TenantMembershipClaim
│   ├── authorization/      # CASL-based authorization
│   │   ├── ability.factory.ts                # createForTenant — single source of role→ability rules
│   │   ├── ability.types.ts                  # AppAbility, AppSubjects, Actions
│   │   ├── ability.interceptor.ts            # global APP_INTERCEPTOR — builds req.ability
│   │   ├── assert-can.ts                     # assertCan, asSubject helpers
│   │   ├── current-ability.decorator.ts      # @CurrentAbility() param decorator
│   │   ├── policy.guard.ts                   # @CheckPolicy() for class-level coarse checks
│   │   ├── authorization.module.ts           # @Global, exports AbilityFactory + PolicyGuard
│   │   └── index.ts                          # barrel
│   └── email/              # @Global EmailModule
│       ├── email.interface.ts                # IEmailProvider + EMAIL_PROVIDER token
│       ├── console.provider.ts               # default — logs to stdout
│       ├── gmail.provider.ts                 # picked when GMAIL_APP_PASSWORD is set
│       ├── resend.provider.ts                # picked when RESEND_API_KEY is set
│       └── email.module.ts
│
├── shared/                 # cross-module building blocks (response DTOs live here)
│   ├── dto-examples.ts     # @ApiProperty example constants — SINGLE source of truth
│   └── dto/                # ONE response DTO per Prisma entity
│       ├── user.dto.ts
│       ├── tenant.dto.ts
│       ├── member.dto.ts
│       ├── campaign.dto.ts
│       ├── campaign-item.dto.ts
│       ├── pledge.dto.ts
│       ├── transaction.dto.ts
│       ├── invitation.dto.ts
│       ├── meta.dto.ts
│       └── delete-response.dto.ts
│
└── modules/
    ├── core/               # Layer 1 — one folder per Prisma entity
    │   ├── user/
    │   │   ├── user.types.ts                 # INTERNAL input interfaces (not classes)
    │   │   ├── repository/user.repository.ts
    │   │   ├── services/user.service.ts
    │   │   └── user.module.ts                # exports only the Service
    │   ├── tenant/
    │   ├── member/
    │   ├── campaign/
    │   ├── campaign-item/
    │   ├── pledge/
    │   ├── transaction/
    │   ├── invitation/
    │   └── audit/                            # AuditEvent — append-only, written by features
    │
    ├── processes/          # Layer 2 — multi-step orchestration, no controllers
    │   ├── invitation-processing/
    │   │   ├── services/invitation-processing.service.ts
    │   │   └── invitation-processing.module.ts
    │   └── member-merging/                   # admin-driven member dedup flow
    │       ├── services/member-merging.service.ts
    │       └── member-merging.module.ts
    │
    └── features/           # Layer 3
        ├── auth-feature/                     # exempt from intent split (see §6.5)
        │   ├── controllers/auth.controller.ts
        │   ├── services/auth-feature.service.ts
        │   ├── dto/                          # legacy flat dto/ folder
        │   └── auth-feature.module.ts
        ├── admin-feature/                    # platform intent only (super-admin tooling)
        │   ├── controllers/platform/
        │   │   ├── requests/                 # one class per file + index.ts barrel
        │   │   ├── responses/
        │   │   ├── decorators/
        │   │   ├── admin.platform.controller.ts
        │   │   └── index.ts
        │   ├── services/admin-feature.service.ts
        │   └── admin-feature.module.ts
        ├── tenant-feature/                   # platform + tenant + self intents
        │   ├── controllers/
        │   │   ├── platform/                 # /platform/tenants/*  (super-admin)
        │   │   │   ├── requests/
        │   │   │   │   ├── create-tenant.request.ts
        │   │   │   │   └── index.ts
        │   │   │   ├── responses/
        │   │   │   │   ├── tenant.response.ts
        │   │   │   │   └── index.ts
        │   │   │   ├── decorators/index.ts
        │   │   │   ├── tenant.platform.controller.ts
        │   │   │   └── index.ts
        │   │   ├── tenant/                   # /tenants/:tenantId/* (admin)
        │   │   └── self/                     # /tenants/:tenantId/me/church (member)
        │   ├── services/tenant-feature.service.ts   # unified, no role branches
        │   └── tenant-feature.module.ts
        ├── member-feature/                   # tenant + self intents
        ├── campaign-feature/                 # tenant + self intents
        ├── pledge-feature/                   # tenant + self intents
        ├── transaction-feature/              # tenant + self intents
        └── invitation-feature/               # tenant + public intents (token lookup/accept)
```

---

## 6. Module anatomy — **READ THIS BEFORE ADDING ANYTHING**

This is the single most important section. Each layer has a specific shape
that MUST be followed.

### 6.1 Core module (`src/modules/core/<entity>/`)

**Purpose:** single-entity CRUD — read/write *one* Prisma table, with no
cross-entity knowledge.

**Required files:**

```
modules/core/<entity>/
├── <entity>.types.ts           # plain TS interfaces (NOT classes)
├── repository/<entity>.repository.ts
├── services/<entity>.service.ts
└── <entity>.module.ts
```

**Rules:**

1. **`<entity>.types.ts`** contains `Create<Entity>Input`, `Update<Entity>Input`,
   and `<Entity>Filters` — plain TypeScript interfaces.
   - **NO** `class-validator` decorators. This is the internal service
     contract, not an HTTP boundary.
   - **NO** `@ApiProperty`. Core modules have no HTTP surface.
2. **`repository/<entity>.repository.ts`** is the *only* file in the whole
   codebase that imports `Prisma` types (`Prisma.XxxWhereInput`, etc.)
   **and** the *only* place that calls `this.prisma.*` directly. Services
   and features never touch `this.prisma` — if a feature needs a new
   query, add a method to the relevant repo + service.
   - Inject `PrismaClientService`.
   - For tenant-scoped entities, `findById(tenantId, id)` etc. filter
     by `tenantId`; **do not** manually add `deletedAt: null` — the
     soft-delete extension injects it automatically at every nesting
     depth (see §8.3).
   - `update()` uses `where: { id }` (Prisma 7 requires a unique
     `where`) — tenant ownership is verified by the service's
     `getById()` call **before** mutation.
   - `softDelete()` / `restore()` wrap the cascade-aware helpers from
     [soft-delete](src/infrastructure/prisma-client/soft-delete/) — see
     §8.3 for the exact shape.
3. **`services/<entity>.service.ts`** wraps the repo, throws
   `NotFoundException` for missing records, and enforces invariants.
   - Takes the interfaces from `<entity>.types.ts`.
   - Never imports another core service.
4. **`<entity>.module.ts`** declares the repo + service as providers, and
   **exports only the service**. The repository is implementation detail.
   ```ts
   @Module({
     providers: [UserRepository, UserService],
     exports: [UserService],
   })
   export class UserCoreModule {}
   ```
5. Module class name is `<Entity>CoreModule`. File name is `<entity>.module.ts`.

**Anti-patterns (reject these in review):**

- ❌ Core service importing another core service. Use a process/feature instead.
- ❌ `class-validator` decorators on `*.types.ts`. Move to feature request DTOs.
- ❌ Importing Prisma types outside `repository/`.
- ❌ Calling `this.prisma.*` from a service (core, feature, or process).
  Data access lives in repositories. The only exceptions are documented
  infrastructure services that *cannot* import Core (e.g.
  [user-claims.service.ts](src/infrastructure/firebase-auth/user-claims.service.ts),
  [tenant.guard.ts](src/infrastructure/firebase-auth/guards/tenant.guard.ts))
  — those carry an in-file comment explaining the layering trade-off.
- ❌ Hand-stamping `deletedAt: null` into a where clause — the
  extension already injects it (see §8.3).

### 6.2 Process module (`src/modules/processes/<name>-processing/`)

**Purpose:** a reusable multi-step operation that joins two or more core
entities. Has **no controllers** — it's pure orchestration consumed by
features.

**Required files:**

```
modules/processes/<name>-processing/
├── services/<name>-processing.service.ts
└── <name>-processing.module.ts
```

**Rules:**

1. **Service** takes an input interface defined **inside the service file**
   (`export interface IssueInvitationInput { … }`) — no separate dto/ folder.
2. Imports multiple core modules, never features, never other processes.
3. **Module** imports the core modules it uses and exports its service.
4. Module class name is `<Name>ProcessingModule`. File name is
   `<name>-processing.module.ts`.
5. When a process needs to conditionally do one of several things, keep the
   branching *in the process*, not in the feature that triggers it.

**When to create a process vs a feature:**

- If multiple features would trigger the same multi-step flow → **process**.
- If the flow is only ever triggered by one feature → keep it in the feature
  service. Don't preemptively extract.

### 6.3 Feature module (`src/modules/features/<name>-feature/`)

**Purpose:** HTTP-facing workflow. Controllers, request validation, and
orchestration of core/process services.

**Required files (intent-split):**

```
modules/features/<name>-feature/
├── controllers/
│   ├── platform/                  # super-admin platform routes (when applicable)
│   │   ├── requests/
│   │   │   ├── <verb>-<entity>.request.ts   # one class per file
│   │   │   └── index.ts                      # barrel
│   │   ├── responses/
│   │   │   ├── <entity>.response.ts          # one class per file
│   │   │   └── index.ts
│   │   ├── decorators/
│   │   │   └── index.ts                      # placeholder when empty
│   │   ├── <entity>.platform.controller.ts
│   │   └── index.ts
│   ├── tenant/                    # admin tenant-management routes
│   ├── self/                      # member self-service routes
│   └── public/                    # unauthenticated / token-based (when applicable)
├── services/<name>-feature.service.ts
└── <name>-feature.module.ts
```

**Intent split — non-negotiable.** Controllers are organized by *intent*,
not by role. The URL prefix declares scope; CASL enforces authorization:

- `platform/` → `/platform/*` — super-admin only (no tenant context)
- `tenant/` → `/tenants/:tenantId/*` — admin tenant-management
- `self/` → `/tenants/:tenantId/me/*` — member self-service (any role)
- `public/` → `/<resource>/*` — token-based, no caller identity required

**Rules:**

1. **Controller**
   - One `<entity>.<intent>.controller.ts` per intent folder.
   - `@ApiTags('<plural-noun> (<intent>)')` — `e.g. "pledges (tenant)"`.
   - `@ApiBearerAuth('Bearer')` per intent (omit on `public/` lookup-style
     endpoints; keep on authenticated public endpoints like accept).
   - Every handler injects `@CurrentAbility() ability: AppAbility` and calls
     `assertCan(ability, action, subject)` — for class-level access (string
     subject) or row-level access (`asSubject('Foo', resource)`).
   - `tenant/` and `self/` controllers apply `@UseGuards(TenantGuard)` and
     declare `@ApiParam({ name: 'tenantId' })` plus `@Controller('tenants/:tenantId/...')`.
   - `platform/` controllers apply `@Roles('SUPER_ADMIN')` as defense-in-depth
     before the CASL check.
   - Self controllers force `memberId` from `tenant.memberId` — request DTOs
     do not even accept `memberId`. If `tenant.memberId` is undefined, throw
     `NotFoundException` (super-admin without a Member row).
   - Path params get `@ApiParam({ name })`. Handlers are thin — delegate to
     the unified feature service.
   - Each `requests/`, `responses/`, `decorators/` folder ships a barrel
     `index.ts`. One class per file inside.

2. **Feature service**
   - **Unified — no per-intent split.** Authorization happens at the
     controller boundary via CASL; the service trusts pre-authorized inputs.
   - **No role branching.** Anywhere you'd write `if (tenant.role === ...)`,
     stop — that's a controller responsibility now.
   - Defines internal `<Verb><Entity>ServiceInput` interfaces. Controllers
     translate their HTTP DTOs into these.
   - Orchestrates core/process services, validates business invariants,
     records audit entries.
   - NEVER imports another feature service.

3. **Feature module**
   - Imports the core/process modules it depends on.
   - Declares all per-intent controllers + the unified feature service.
   - Does **not** export anything.
   - Class name `<Name>FeatureModule`, file `<name>-feature.module.ts`.

### 6.5 Auth feature is exempt

`auth-feature/` does **not** follow the intent-split convention. Auth
endpoints (`/auth/session`, `/auth/me`, `/auth/sign-out-everywhere`) are
orthogonal to tenant/role and have multi-step flows wrapped in the
frontend's `auth/actions.ts`. Keep the legacy `controllers/auth.controller.ts`
+ `dto/` shape there.

### 6.6 Authorization — CASL is the only source of truth

Every authorization decision flows through one place:
[`src/infrastructure/authorization/ability.factory.ts`](src/infrastructure/authorization/ability.factory.ts).
That file is the **single registry** for "who can do what." Edit it (and
only it) when granting or revoking a capability.

The pipeline:

1. `FirebaseAuthGuard` (global) populates `req.user`.
2. `RolesGuard` enforces `@Roles('SUPER_ADMIN')` on platform routes.
3. `TenantGuard` resolves `:tenantId`, validates membership, populates
   `req.tenant: TenantContext`.
4. `AbilityInterceptor` (global) builds `req.ability: AppAbility` from
   `tenant` (if present) or from `user.isSuperAdmin` (platform routes).
5. Controllers inject `@CurrentAbility()` and call
   `assertCan(ability, action, subject)` to enforce the rule.

**Adding capabilities to a new entity:**

1. Add the Prisma model to `AppSubjects` in
   [`ability.types.ts`](src/infrastructure/authorization/ability.types.ts).
2. Register rules per role in
   [`ability.factory.ts`](src/infrastructure/authorization/ability.factory.ts) —
   USER rules MUST carry a Prisma where-condition pinning the resource to
   `tenant.memberId` (or other identity field).
3. In the entity's controllers, `assertCan(ability, "<action>",
   asSubject("<Entity>", row))` for resource-level checks, or
   `assertCan(ability, "<action>", "<Entity>")` for class-level checks.

**Anti-patterns:**

- ❌ Reading `tenant.role` outside `ability.factory.ts`.
- ❌ Adding `@TenantRoles('ADMIN')` decorators on intent-split controllers
  — the URL path + CASL covers it.
- ❌ Per-role helper methods in services (`ensureMemberVisibility`,
  `assertAdminOrSuperAdmin`, etc.) — these belong in the ability factory.
- ❌ Duplicating ability rules — there is exactly one `createForTenant`.

### 6.4 Main module (`src/main.module.ts`)

- Imports `ConfigModule` (global), all infra modules
  (`PrismaClientModule`, `FirebaseAuthModule`, `EmailModule`,
  `AuthorizationModule`), all core modules, all process modules, all
  feature modules.
- Registers global `APP_GUARD`s in this order:
  1. `FirebaseAuthGuard` — verifies the bearer token (skipped on `@Public()`).
  2. `RolesGuard` — enforces `@Roles('SUPER_ADMIN')` metadata.
- `AbilityInterceptor` is registered as `APP_INTERCEPTOR` inside
  `AuthorizationModule` (not in MainModule) to keep authorization wiring
  colocated.
- Bootstrap file [`main.ts`](src/main.ts) sets the `/api` prefix, URI
  versioning (`v1` default), CORS (with `X-Claims-Refreshed` exposed),
  the validation pipe, registers `ClaimsRefreshInterceptor` +
  `GlobalResponseInterceptor` as global interceptors, and calls
  `setupSwagger(app)`.

---

## 7. DTO conventions — **the contract with the frontend**

The frontend generates TypeScript types from our OpenAPI JSON at
`/api-docs-json`. Incorrect/missing decorators → wrong frontend types →
runtime bugs. This section is non-optional.

### 7.1 The three DTO tiers

| Tier | Location | Purpose | Decorators | Uses class-validator? |
|------|----------|---------|------------|-----------------------|
| **Shared base** | [`src/shared/dto/<entity>.dto.ts`](src/shared/dto/) | One response DTO per Prisma model — the canonical shape of the entity | `@Expose()` + `@ApiProperty()` | ❌ (response-only) |
| **Feature request** | `src/modules/features/<x>/dto/*.request.dto.ts` | HTTP input for one endpoint | `@ApiProperty()` + `@Is*()` validators | ✅ |
| **Feature response** | `src/modules/features/<x>/dto/*.response.dto.ts` | HTTP output for one endpoint | Usually `extends Shared` via `PickType`/`OmitType`, plus extras | ❌ |

**Core module internal types** (`<entity>.types.ts`) are plain interfaces —
they are NOT one of the DTO tiers. They're the internal service contract.

### 7.2 Why we don't share DTOs across modules

- If `feature-a` imports a DTO from `feature-b`, editing `feature-b`'s DTO
  silently changes `feature-a`'s API. Fragile.
- Shared **response** DTOs are fine because they represent the entity itself,
  not any feature's endpoint — they rarely change in breaking ways.
- Each feature owns its controller-level DTOs. When it needs the entity's
  shape, it `extends` the shared base.

### 7.3 Shared base DTOs — the source of truth

One file per Prisma model in [`src/shared/dto/`](src/shared/dto/). Every
field gets:

- `@Expose()` so `class-transformer` serializes it.
- `@ApiProperty({ example })` or `@ApiPropertyOptional({ example, nullable })`
  so OpenAPI schemas include the shape AND an example.

Examples come from [`src/shared/dto-examples.ts`](src/shared/dto-examples.ts)
so they stay consistent. **Add new constants there** instead of hard-coding
examples.

```ts
// src/shared/dto/tenant.dto.ts
export class TenantDto {
  @Expose() @ApiProperty({ example: ID_EXAMPLE })
  id!: string;

  @Expose() @ApiProperty({ example: CHURCH_NAME_EXAMPLE })
  name!: string;

  @Expose() @ApiPropertyOptional({ example: ADDRESS_EXAMPLE, nullable: true })
  address!: string | null;

  // … every column on the Prisma model …
}
```

**Nullable fields:** use `@ApiPropertyOptional({ nullable: true })` + the TS
type `| null`. Required fields use `@ApiProperty`.

**Enum fields:** `@ApiProperty({ enum: MemberRole, example: MemberRole.USER })`.

**Decimal fields (Prisma `Decimal`):** transform to number so the API returns
a JSON number, not the `Prisma.Decimal` object:
```ts
@Expose()
@Transform(({ value }) => (value instanceof Prisma.Decimal ? value.toNumber() : value))
@ApiProperty({ example: AMOUNT_EXAMPLE })
amount!: number;
```

### 7.4 Feature request DTOs

Per-endpoint input. Both `@ApiProperty()` and `@Is*()` validators. Use
`PartialType(CreateFooRequestDto)` for updates — it preserves metadata AND
makes every field optional.

```ts
// src/modules/features/tenant-feature/dto/tenant.request.dto.ts
export class CreateTenantRequestDto {
  @ApiProperty({ example: CHURCH_NAME_EXAMPLE })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ example: CURRENCY_EXAMPLE })
  @IsOptional()
  @IsString()
  currency?: string;
}

export class UpdateTenantRequestDto extends PartialType(CreateTenantRequestDto) {}
```

**Do NOT** extend `TenantDto` for requests. Shared base DTOs have
`@ApiProperty` but not validators — `PickType` copies what's there, and you'd
lose validation. Either declare the request shape fresh, or (advanced) use
`PickType(CreateTenantRequestDto, [...])`.

**Query/filter DTOs** go in the request file too. Use
`@Type(() => Number)` / `@Type(() => Date)` from `class-transformer` for
query-string coercion (the global pipe has `transform: true,
enableImplicitConversion: true`).

### 7.5 Feature response DTOs

Extend the shared base via `PickType` / `OmitType` / `IntersectionType` from
`@nestjs/swagger` (these preserve Swagger metadata — `class-transformer`'s
equivalents do not).

```ts
// src/modules/features/tenant-feature/dto/tenant.response.dto.ts
export class TenantResponseDto extends TenantDto {}

// Or pick a subset:
export class TenantSummaryResponseDto extends PickType(TenantDto, ['id', 'name', 'logoUrl'] as const) {}

// List responses wrap items + meta:
export class TenantListResponseDto {
  @Expose() @Type(() => TenantResponseDto)
  @ApiProperty({ type: [TenantResponseDto] })
  items!: TenantResponseDto[];

  @Expose() @Type(() => MetaDto)
  @ApiProperty({ type: MetaDto })
  meta!: MetaDto;
}
```

If a list needs extra aggregates (e.g., `sum` for transactions), extend
`MetaDto` rather than inventing a new meta class.

### 7.6 Controller decorator cheat sheet

| Decorator | When to use |
|-----------|-------------|
| `@ApiTags('...')` | Group endpoints in Scalar |
| `@ApiBearerAuth('Bearer')` | Signals that the endpoint needs the bearer token. Must match the scheme name used in `swagger.config.ts` — currently `'Bearer'` |
| `@ApiOperation({ summary, description })` | One-line summary + optional long description |
| `@ApiParam({ name, description })` | Path param — required for every `:param` |
| `@ApiQuery({ name })` | Query param — usually inferred from the DTO class; only needed for dynamic params |
| `@ApiBody({ type })` | Usually inferred from `@Body() body: X` — include when the body isn't a DTO class |
| `@ApiOkResponse({ type })` | `200` |
| `@ApiCreatedResponse({ type })` | `201` |
| `@ApiNoContentResponse()` | `204` |
| `@ApiBadRequestResponse()`, `@ApiUnauthorizedResponse()`, `@ApiForbiddenResponse()`, `@ApiNotFoundResponse()` | Error responses — add when the endpoint can return them for non-trivial reasons (e.g. unauthorized access to another tenant's data) |

Every handler **must** declare a response type via one of the response
decorators. If the handler returns nothing, use `@ApiNoContentResponse()` +
`@HttpCode(204)`.

### 7.7 Shared filter base DTOs — compose, don't redeclare

List endpoints repeatedly accept the same three query-string contracts:
soft-delete state flags, an inclusive date range, and offset/limit
pagination. To keep them consistent, each contract has a single shared
base DTO in `src/shared/dto/` that concrete filter DTOs compose via
`IntersectionType` from `@nestjs/swagger`:

| Shared base | Path | Fields |
|---|---|---|
| `StateFilterRequestDto` | [state-filter.request.dto.ts](src/shared/dto/state-filter.request.dto.ts) | `includeDeleted`, `onlyDeleted` (3-state archive filter; encoding matches `applyStateFilter` in the soft-delete helpers) |
| `DateRangeRequestDto` | [date-range.request.dto.ts](src/shared/dto/date-range.request.dto.ts) | `dateFrom`, `dateTo` (both inclusive, ISO 8601 UTC) |
| `PaginationRequestDto` | [pagination.request.dto.ts](src/shared/dto/pagination.request.dto.ts) | `offset`, `limit` |

Compose only the bases you actually need:

```ts
// State + date + pagination — the typical "admin list" shape.
export class PledgeFiltersRequestDto extends IntersectionType(
  StateFilterRequestDto,
  DateRangeRequestDto,
  PaginationRequestDto,
) {
  @ApiPropertyOptional({ enum: PledgeStatus })
  @IsOptional()
  @IsEnum(PledgeStatus)
  status?: PledgeStatus;
  // …
}

// Date + pagination only — no archive switcher on the surface.
export class MyTransactionFiltersRequestDto extends IntersectionType(
  DateRangeRequestDto,
  PaginationRequestDto,
) { /* … */ }
```

**Overriding a single field.** If a concrete DTO needs to *tighten* an
inherited field (e.g. cap `limit` at 200 on the audit log), use
`OmitType` to drop the inherited declaration, then redeclare locally:

```ts
export class AuditEventsQueryRequestDto extends IntersectionType(
  DateRangeRequestDto,
  OmitType(PaginationRequestDto, ["limit"] as const),
) {
  // …
  @ApiPropertyOptional({ example: 50, maximum: 200 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200)
  limit?: number;
}
```

Do NOT redeclare an inherited field without `OmitType` — TS will reject
it (TS2612) and a `declare` workaround would strip the decorators so
class-validator silently drops the rules.

**The column the range applies to is endpoint-specific.** Always
document it in the DTO's leading comment (`dateFrom`/`dateTo` bracket
`createdAt` on pledges/campaigns/audit/invitations; `Transaction.date`
on transactions). Repositories apply the range directly to that column
in their `where` builder.

**The `/transactions/summary` endpoint is a hybrid.** It extends
`DateRangeRequestDto` and adds a legacy `months` rolling-window
fallback — when `dateFrom`/`dateTo` are present the explicit range
wins; otherwise the feature service builds an N-month window.
See [transaction-summary-query.request.ts](src/modules/features/transaction-feature/controllers/tenant/requests/transaction-summary-query.request.ts).

**Invitations list returns every status by default.** The legacy
"PENDING-only" behavior was replaced when the filter DTO landed; pass
`status=PENDING` (or any other value) to scope. The list response now
carries `MetaDto` (`offset`/`limit`/`total`) like every other paged
endpoint.

### 7.8 File naming (intent-split features)

- One **class per file**. No multi-class files inside intent folders.
- Requests: `<verb>-<entity>.request.ts` (e.g. `create-pledge.request.ts`).
  The class name still ends in `Dto` (e.g. `CreatePledgeRequestDto`).
- Responses: `<entity>.response.ts` or `<entity>-<variant>.response.ts`
  (e.g. `pledge-list.response.ts`, `transaction-summary.response.ts`).
- Self-intent DTOs use the `My...` prefix to distinguish them from the
  tenant-intent counterparts (`MyPledgeResponseDto`, `MyPledgeFiltersRequestDto`).
- Each `requests/`, `responses/`, `decorators/` folder ships an
  `index.ts` barrel re-exporting every class.
- Auth feature is exempt — keep its legacy `dto/<noun>.request.dto.ts`
  shape.

---

## 8. Prisma — schema, migrations, client

### 8.1 Multi-file schema

The schema is split across [`prisma/schema/`](prisma/schema/) — one file per
entity/domain group. Prisma 7 merges every `*.prisma` in that folder at
build time.

- `schema.prisma` holds **only** the `generator` + `datasource` blocks.
- One file per entity: `user.prisma`, `tenant.prisma`, `member.prisma`, etc.
- Enums live **in the file of the model they belong to** (e.g.,
  `MemberRole` in `member.prisma`, `InvitationStatus` in `invitation.prisma`).
- Cross-file relations just work — no import syntax.
- Wired via [`prisma.config.ts`](prisma.config.ts): `schema: 'prisma/schema'`.

### 8.2 Prisma 7 specifics

- `DATABASE_URL` is NOT in `schema.prisma`'s `datasource` block (Prisma 7
  removed that). It's injected via `prisma.config.ts` using
  `env('DATABASE_URL')`.
- `PrismaClientService` (in `infrastructure/prisma-client/`) uses the
  **`PrismaPg` adapter** and passes `{ adapter }` to the `super()` call
  (Prisma 7 requires `adapter` or `accelerateUrl`).
- After schema edits, run `npm run prisma:generate` to regenerate types.
- Use `npm run prisma:migrate` in dev (creates + applies a migration).

### 8.3 Soft delete — managed by the Prisma extension at [src/infrastructure/prisma-client/soft-delete/](src/infrastructure/prisma-client/soft-delete/)

Every soft-deletable entity has three columns: `deletedAt: DateTime?`,
`deletedBy: String?`, and `deletedByCascade: Boolean @default(false)`.
The extension is applied to `PrismaClientService` via a proxy in
[prisma-client.module.ts](src/infrastructure/prisma-client/prisma-client.module.ts),
so repositories that inject `PrismaClientService` get the behavior for
free.

#### What the extension does

| Operation | Behavior |
|---|---|
| `findMany` / `findFirst` / `findFirstOrThrow` / `count` / `aggregate` / `groupBy` | Inject `deletedAt: null` into `where` so tombstones are excluded. |
| `findUnique` / `findUniqueOrThrow` | Post-query check; widens `select`/`omit` to include `deletedAt` so a custom projection cannot fail open. |
| `update` / `updateMany` / `updateManyAndReturn` / `upsert` / `delete` / `deleteMany` | Inject `deletedAt: null` into `where` so tombstones are immutable. |
| `create` / `createMany` / `createManyAndReturn` | Pass through — no `where` to filter. |

**Escape hatch**: include `deletedAt` explicitly in your `where` to opt
out of the auto-filter (any value works — `deletedAt: undefined` for
"all rows", `deletedAt: { not: null }` for "only tombstones"). This is
the same mechanism the `restore` helper uses to reach into the tombstone
set.

**Relations are filtered too — industry-standard behavior matching
Laravel/Rails/Django.** A single walker recurses through `include` /
`select` / `where` / `_count` and injects `deletedAt: null` at every
relation that targets a soft-deletable model:

- To-many (`include: { items: true }`) → only active items returned.
- Optional to-one (`include: { member: true }`) → field is `null` if
  the related row is archived.
- Required to-one (`include: { campaign: true }` on `Pledge`) → Prisma
  generates `XxxDefaultArgs` which has no `where` field, so the
  extension can't honestly filter it without lying about non-null
  types. Tombstones surface here; callers must inspect
  `joined.campaign.deletedAt` if it matters. This is a Prisma
  constraint, not a design choice.
- Relation predicates in top-level `where` — including inside
  `AND`/`OR`/`NOT` and the to-many `some`/`every`/`none` operators —
  get the same auto-filter. `where: { member: { firstName: "John" } }`
  matches only active Johns.
- `_count` (both `_count: true` shorthand and the object form
  `_count: { select: { items: true } }`) → counts only active rows.
  The walker expands the shorthand to the object form server-side so
  both surfaces agree.

#### `withDeleted(modelName, args)` — opt-in to tombstones

The Laravel/Rails-style escape hatch. Pre-seeds `deletedAt: undefined`
through the entire query tree so a single wrapper bypasses the
auto-filter at every level:

```ts
import { withDeleted } from "@infrastructure/prisma-client/soft-delete";

// Includes archived members AND archived pledges AND archived campaigns
const members = await prisma.member.findMany(
  withDeleted("Member", {
    where: { tenantId },
    include: { pledges: { include: { campaign: true } } },
  }),
);
```

For surgical opt-out, callers can also include `deletedAt` manually in
any single where (top-level or nested). `withDeleted` is just sugar
that does it for the whole tree.

`withDeleted` **throws** if `modelName` doesn't match a model in the
Prisma schema. This catches typos like `withDeleted("Memer", ...)` that
would otherwise silently no-op and leak tombstones into a query the
caller thought was opted out.

#### The `softDelete` / `restore` helpers — repository layer only

The helpers exist in
[soft-delete.helpers.ts](src/infrastructure/prisma-client/soft-delete/soft-delete.helpers.ts).
**They are invoked by repositories, not by services or features.** Each
soft-deletable entity exposes the operation through three layers:

```text
Feature/Process service
        ▼  resolves internal User.id from firebase UID, passes as actorId
Core service.delete(tenantId, id, actorId)   ← throws NotFoundException on miss
        ▼
Core repository.softDelete(tenantId, id, actorId)   ← wraps the helper
        ▼
softDelete(tx, "Model", { where, actorId })   ← runs the cascade in $transaction
```

> **`actorId` is the internal `User.id`, NOT the firebase UID.** Stamping
> the FK to our own `User` table makes "who deleted this" answerable
> without a Firebase round-trip and survives a Firebase account deletion.
> `AuditEvent.actorUid` keeps the firebase UID separately for the audit
> trail — same actor, two identifiers, two purposes.

Concretely:

```ts
// Feature service (e.g. CampaignFeatureService.delete) — resolves User.id
// before calling core service.
const actor = await this.userService.findByFirebaseUid(user.firebaseUid);
const campaign = await this.campaignService.delete(
  tenant.tenantId,
  id,
  actor?.id ?? null,
);
await this.auditService.record({
  ...
  actorUid: user.firebaseUid,      // audit still uses the firebase UID
  entityId: campaign.id,
});

// Core service (e.g. CampaignService.delete) — thin wrapper that
// preserves NotFound semantics and forwards actorId.
async delete(tenantId: string, id: string, actorId: string | null) {
  await this.getById(tenantId, id);
  return this.campaignRepository.softDelete(tenantId, id, actorId);
}

// Core repository (e.g. CampaignRepository.softDelete) — the only place
// the helper is called. Returns the tombstone via withDeleted so the
// caller can audit by id.
async softDelete(tenantId: string, id: string, actorId: string | null) {
  return this.prisma.$transaction(async (tx) => {
    await softDelete(tx, "Campaign", { where: { id, tenantId }, actorId });
    return tx.campaign.findFirstOrThrow(
      withDeleted("Campaign", { where: { id, tenantId } }),
    );
  });
}
```

The `restore` flow mirrors this. Restore-capable entities (Campaign,
Tenant) also expose `service.restore(tenantId, id)` →
`repository.restore(tenantId, id)` → `restore(tx, "Model", { where })`.

Cascade discovery reads `@relation(..., onDelete: Cascade)` declarations
directly from the `.prisma` schema files at startup (Prisma 7 strips
`relationOnDelete` from runtime DMMF). Composition relations cascade;
association relations don't. The `deletedByCascade` flag distinguishes
"cascaded by this parent" from "independently deleted" so `restore`
doesn't resurrect rows the admin had intentionally archived earlier.

#### Deployment requirement

The extension reads `prisma/schema/*.prisma` at first use. The schema
directory must be present at runtime in production. If your Docker
image strips non-`src/` files, set `SOFT_DELETE_SCHEMA_DIR` to the path
where the schema files live, or include `prisma/schema/` in the image.

#### When you add a new soft-deletable model

1. Add `deletedAt`, `deletedBy`, and `deletedByCascade` columns to the
   `.prisma` model.
2. Generate the migration. If the model has unique constraints whose
   identifier should be reclaimable after archive (e.g. a tenant-scoped
   email), edit the generated migration to make those uniques **partial**:
   `CREATE UNIQUE INDEX "..._key" ON "Table"(...) WHERE "deletedAt" IS NULL`.
   Keep the index name Prisma chose so `upsert` keeps working.
3. If the model is a composition child of another soft-deletable model,
   add `onDelete: Cascade` to the `@relation` — the extension will pick
   it up automatically.
4. Add a `softDelete(tenantId, id, actorId)` method to the entity's
   repository that calls the helper inside `$transaction` and returns
   the tombstone via `withDeleted`. Expose
   `delete(tenantId, id, actorId)` on the core service that calls
   `getById` first (for NotFound semantics) then forwards to the repo.
5. Feature handlers resolve the internal User.id via
   `userService.findByFirebaseUid(user.firebaseUid)`, then call
   `entityService.delete(..., actor?.id ?? null)` and pass the returned
   row to the audit record (which still uses `user.firebaseUid` as
   `actorUid`).

#### Anti-patterns

- ❌ Writing `prisma.member.update(...)` to mutate a tombstone — the
  extension blocks this. Use `restore` or pass an explicit `deletedAt`
  filter if you genuinely need to touch a tombstone.
- ❌ Using `upsert` to "find or restore" an archived row — upsert
  creates a fresh row in the freed slot (partial unique allows it).
  Restore the tombstone explicitly to preserve linked history.
- ❌ Hand-rolling soft-delete with `prisma.x.update({ data: { deletedAt: dayjs().toDate() } })` —
  it skips the cascade, skips `deletedBy`/`deletedByCascade`, and is
  blocked by the extension once the row is a tombstone. Use the repo's
  `softDelete` method, which wraps the cascade-aware helper.
- ❌ Calling the `softDelete` / `restore` helpers from a feature or
  process service. The helpers belong to the repository layer; features
  invoke them through `entityService.delete(...)` /
  `entityService.restore(...)`. Same rule for `withDeleted` — wrap it
  in a repo method (e.g. `findByIdIncludingDeleted`) and expose that
  through the service.
- ❌ Forgetting to thread `actorId` through `service.delete(...)` —
  `deletedBy` will be `NULL` on the tombstone. Resolve the internal
  `User.id` via `userService.findByFirebaseUid(user.firebaseUid)` first;
  pass that (NOT the firebase UID) as `actorId`.
- ❌ Passing `user.firebaseUid` as `actorId` to `service.delete(...)`.
  `deletedBy` columns store the internal `User.id` — the firebase UID
  only lives on `AuditEvent.actorUid`.
- ❌ Stamping `deletedAt: null` into a read `where` clause. The
  extension already injects it at every nesting depth (including
  `AND`/`OR`/`NOT`, `some`/`every`/`none`, and relation predicates
  inside `where`). Manual filters are noise — and inviting them invites
  authors to *not* add them next time, which silently leaks
  tombstones.
- ❌ Threading `deletedAt: undefined` through 4 levels of nested
  `include` by hand — use `withDeleted(modelName, args)` instead.
- ❌ Assuming `pledge.campaign` is non-null at runtime when the
  campaign might be archived. Required to-one relations surface
  tombstones; check `pledge.campaign.deletedAt`.
- ❌ Using `$queryRaw` for aggregates over soft-deletable tables —
  raw SQL bypasses the extension entirely and will return tombstones.
  Use `groupBy` / `aggregate` / `findMany`-plus-JS-bucket instead.

### 8.4 Tenant scoping

All tenant-owned entities have `tenantId: String`. Every repository method
that returns tenant-owned data takes `tenantId` as its first argument and
filters on it. This is the line of defense against data leaks across
churches.

---

## 9. Firebase auth

**We use Firebase for authentication only** (ID token verification + custom
claims). No Firestore, no FCM, no Storage.

### 9.1 Flow — there is no "active tenant" claim

The active tenant is **derived from the URL** (`/tenants/:tenantId/...`),
never stored in custom claims. There is no `switch-tenant` endpoint. A
Firebase user carries a snapshot of every tenant they belong to via the
`tenantMemberships` claim, keyed by tenant slug. `TenantGuard` resolves
the URL's `:tenantId` (UUID **or** slug) and produces the per-request
`TenantContext`.

1. Frontend does Google SSO via Firebase client SDK → gets an ID token.
2. Frontend calls `POST /api/v1/auth/session` with `{ idToken }`.
3. `AuthController.createSession` (`@Public()`) verifies the token,
   upserts the global `User`, snapshots every tenant membership into
   custom claims via `UserClaimsService.refreshFor`, and returns the
   populated session.
4. Frontend sends `Authorization: Bearer <idToken>` on subsequent requests.
5. `FirebaseAuthGuard` (global `APP_GUARD`) verifies the token on every
   non-`@Public()` request and attaches `AuthUser` to `req.user`.
6. Routes under `/tenants/:tenantId/...` apply `@UseGuards(TenantGuard)`.
   `TenantGuard` (a) resolves `:tenantId` (UUID or slug) → real tenant,
   (b) checks `user.tenantMemberships[tenant.slug]` (or `isSuperAdmin`),
   (c) optionally enforces `@TenantRoles('ADMIN')`, (d) writes
   `req.tenant: TenantContext`.
7. Whenever a handler that **changes the caller's own claims** runs (e.g.
   `POST /platform/users/:id` toggling super-admin on themselves, accepting
   an invitation, claiming a pre-created member), it should be marked
   `@RefreshesClaims()`. The `ClaimsRefreshInterceptor` then sets
   `X-Claims-Refreshed: 1` on the response. The frontend reacts by
   force-refreshing the ID token and re-minting the Next session cookie —
   no manual `refreshSession()` call required.

### 9.2 Decorators on controllers

```ts
@Public()                       // skip auth entirely (login, health, /invitations/lookup)
@Roles('SUPER_ADMIN')           // platform-level role (RolesGuard, global APP_GUARD)
@TenantRoles('ADMIN')           // tenant-scoped role (TenantGuard, requires @UseGuards(TenantGuard))
@RefreshesClaims()              // sets X-Claims-Refreshed: 1 on success (see §9.1 step 7)
@CurrentUser() user: AuthUser   // param decorator — full auth user
@CurrentTenant() tenant: TenantContext  // param decorator — only on @UseGuards(TenantGuard) routes
@CurrentAbility() ability: AppAbility   // param decorator — see §6.6
```

`AuthUser` and `TenantContext` shapes (from
[`auth-user.type.ts`](src/infrastructure/firebase-auth/types/auth-user.type.ts)):

```ts
type TenantRole = "ADMIN" | "USER";

interface TenantMembershipClaim {
  memberId: string;
  role: TenantRole;
  name: string;                                      // tenant display name
}

interface AuthUser {
  firebaseUid: string;
  email: string;
  displayName?: string;
  picture?: string;
  isSuperAdmin: boolean;
  tenantMemberships: Record<string, TenantMembershipClaim>;  // keyed by tenant slug
}

// Built per-request by TenantGuard from req.params.tenantId + the matching
// membership claim. memberId/role are undefined for super-admins who lack
// a Member row in this tenant.
interface TenantContext {
  tenantId: string;          // always the UUID
  slug: string;
  memberId?: string;
  role?: TenantRole;
}
```

### 9.3 Guard order matters

Registered as `APP_GUARD` in this order in `main.module.ts`:
1. `FirebaseAuthGuard` — populates `req.user` (or throws 401, unless `@Public()`).
2. `RolesGuard` — enforces `@Roles('SUPER_ADMIN')` against `user.isSuperAdmin`.

`TenantGuard` is opt-in via `@UseGuards(TenantGuard)` on tenant-scoped
controllers (everything under `/tenants/:tenantId/...`). It runs after the
two global guards.

Global interceptors run in this order (from [`main.ts`](src/main.ts)):
1. `ClaimsRefreshInterceptor` — reads `@RefreshesClaims()` metadata, sets the response header.
2. `GlobalResponseInterceptor` — wraps every successful body in `{ success: true, data }`.
3. `AbilityInterceptor` — registered as `APP_INTERCEPTOR` inside
   `AuthorizationModule`. Builds `req.ability` from `req.tenant` (or from
   `user.isSuperAdmin` on platform routes).

### 9.4 When auth is provided via env

`FIREBASE_SERVICE_ACCOUNT_PATH` points to a service-account JSON, OR set
the three variables `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`,
`FIREBASE_PRIVATE_KEY`. See [.env.example](.env.example).

### 9.5 The `X-Claims-Refreshed` contract

CORS in `main.ts` whitelists `X-Claims-Refreshed` under `exposedHeaders` so
browser JS can read it. The frontend's API response middleware sees the
header and triggers a session-cookie remint — every handler that mutates
the caller's own membership/role/super-admin status MUST be tagged
`@RefreshesClaims()` so the frontend doesn't run on stale claims for up
to an hour.

Do **not** add `@RefreshesClaims()` to a handler that mutates *another*
user's claims — those users' devices update on their own next token
refresh.

---

## 10. Common workflows

### 10.1 Add a new Prisma entity

1. Create `prisma/schema/<entity>.prisma` with the model and any enums.
2. `npm run prisma:migrate -- --name add-<entity>` — creates + applies the migration.
3. `npm run prisma:generate` to refresh the typed client.
4. Create `src/shared/dto/<entity>.dto.ts` — full response DTO mirroring
   every column, with `@Expose()` + `@ApiProperty()`. Use/add constants in
   `src/shared/dto-examples.ts`.
5. Create the core module:
   - `src/modules/core/<entity>/<entity>.types.ts`
   - `src/modules/core/<entity>/repository/<entity>.repository.ts`
   - `src/modules/core/<entity>/services/<entity>.service.ts`
   - `src/modules/core/<entity>/<entity>.module.ts` (exports service only)
6. Register the core module in `main.module.ts`'s `coreModules` array.
7. If the entity needs authorization, add it to `AppSubjects` in
   [`ability.types.ts`](src/infrastructure/authorization/ability.types.ts)
   and register rules per role in
   [`ability.factory.ts`](src/infrastructure/authorization/ability.factory.ts).

### 10.2 Add a new HTTP endpoint to an existing feature

1. Add request DTO to `<name>.request.dto.ts` (with validators + `@ApiProperty`).
2. Add response DTO to `<name>.response.dto.ts` (extending shared base as
   needed).
3. Add a method on the feature service that orchestrates core/process calls.
4. Add the handler to the controller with `@ApiOperation`, response
   decorator, role decorator, and proper HTTP verb.

### 10.3 Add a new feature module

1. Create the folder skeleton:
   ```
   src/modules/features/<name>-feature/
   ├── controllers/
   │   ├── platform/                  # if super-admin endpoints exist
   │   ├── tenant/                    # if admin tenant-management endpoints exist
   │   ├── self/                      # if member-facing endpoints exist
   │   └── public/                    # if unauthenticated/token endpoints exist
   ├── services/<name>-feature.service.ts   # unified, no per-intent split
   └── <name>-feature.module.ts
   ```
   Each intent folder must contain `requests/`, `responses/`, `decorators/`
   (with `index.ts` barrels) and `<entity>.<intent>.controller.ts`.
2. Add new entity rules to `ability.factory.ts` (and add the subject to
   `ability.types.ts` if it's a new Prisma model).
3. In the feature module, import the core/process modules it depends on,
   declare every per-intent controller, provide the unified service, and do
   NOT export anything.
4. Register in `main.module.ts`'s `featureModules` array.

### 10.4 Add a new process module

1. Decide it's actually a process — multiple features will use it, not just
   one. If not, keep it in the single feature's service.
2. Skeleton:
   ```
   src/modules/processes/<name>-processing/
   ├── services/<name>-processing.service.ts
   └── <name>-processing.module.ts
   ```
3. Input interface lives in the service file (no separate DTO).
4. Module imports core modules and exports the service.
5. Register in `main.module.ts`'s `processModules` array.

### 10.5 Modify an entity's public shape

1. Update the Prisma model in `prisma/schema/<entity>.prisma`. Migrate.
2. Update `src/shared/dto/<entity>.dto.ts` to reflect the new shape.
3. Every feature response DTO that extends it gets the change automatically
   (thanks to `extends SharedDto` / `PickType`). If a field was removed,
   search for `PickType(SharedDto, [...])` to find places that picked the
   old field.

---

## 11. Anti-patterns — do NOT do these

| Anti-pattern | Fix |
|--------------|-----|
| Feature imports another feature's DTO | Extend shared base instead |
| Core service imports another core service | Lift the join to a feature or process |
| `class-validator` decorators on `<entity>.types.ts` | Move to the feature request DTO |
| Prisma types (`Prisma.XxxWhereInput`) outside a repository | Move to the repository, expose a plain interface |
| Controller, feature, or core service calls `prismaService.xxx` directly | Route through core service → repository. Data access lives only in repositories (or in narrowly-scoped infra services that can't import Core, see §6.1) |
| Hand-stamping `deletedAt: null` / `tenant: { deletedAt: null }` into a where clause | Remove it — the soft-delete extension auto-injects at every nesting depth (§8.3) |
| Soft-deleting via `prisma.x.update({ data: { deletedAt: dayjs().toDate() } })` | Call `entityService.delete(tenantId, id, actorId)` — the repo wraps the cascade-aware helper (§8.3) |
| `$queryRaw` over soft-deletable tables | Raw SQL bypasses the extension and returns tombstones; use `groupBy` / `aggregate` / `findMany`-plus-JS-bucket |
| Handler without `@ApiOperation` or response decorator | Add them — OpenAPI contract is incomplete otherwise |
| Reading `tenant.role` outside `ability.factory.ts` | Use `assertCan(ability, action, subject)` instead |
| Per-role helpers in services (`ensureMemberVisibility`, `assertAdminOrSuperAdmin`) | Move the rule into `ability.factory.ts`; controllers call `assertCan` |
| `@TenantRoles` decorators on intent-split controllers | The URL path + CASL covers it — drop the decorator |
| Putting an admin-management endpoint under `controllers/self/` (or vice versa) | Intent declares scope; pick the folder that matches the *URL meaning*, not the caller's role |
| Self-controller request DTO accepts `memberId` | Self DTOs MUST omit it; `memberId` comes from `tenant.memberId` |
| Tenant-scoped endpoint that doesn't filter by `tenantId` | Add the filter — this is a security bug |
| Trusting `campaignId`/`campaignItemId` from the client when `pledgeId` is also set | Always resolve via the pledge; reject mismatches (see `TransactionFeatureService.resolveAttribution`) |
| `Transaction.campaignItemId` without `campaignId` | Reject — an item without its campaign is meaningless |
| `@ApiProperty` with a made-up example | Reuse / add a constant in `dto-examples.ts` |
| Hard-coded IDs in tests | Use the example constants |
| `npm run build` without first running `prisma:generate` after schema edits | Type errors on `@prisma/client` imports |
| Swapping `@nestjs/swagger`'s `PickType` for `class-transformer`'s | Loses `@ApiProperty` metadata — always import from `@nestjs/swagger` |
| Redeclaring `includeDeleted` / `onlyDeleted` / `dateFrom` / `dateTo` / `offset` / `limit` on a list filter DTO | Compose `StateFilterRequestDto` / `DateRangeRequestDto` / `PaginationRequestDto` via `IntersectionType` (§7.7) |
| Filter DTO that doesn't say which column its `dateFrom`/`dateTo` brackets | Document it in the DTO comment — `createdAt` on pledges/campaigns/audit/invitations, `Transaction.date` on transactions |

---

## 12. Conventions recap (quick reference)

- Module class names: `<Name>CoreModule`, `<Name>ProcessingModule`,
  `<Name>FeatureModule`, plus the singleton `MainModule`.
- File naming: `<entity>.module.ts`, `<entity>.service.ts`,
  `<entity>.repository.ts`, `<name>.request.dto.ts`, `<name>.response.dto.ts`,
  `<entity>.types.ts`.
- Exports:
  - Core module exports the service only.
  - Process module exports the service only.
  - Feature module exports nothing.
  - Infrastructure module exports the client(s) other layers need.
- HTTP routes (intent-split): REST, lowercased plural resource names.
  - Platform: `/platform/<resource>` (super-admin)
  - Tenant: `/tenants/:tenantId/<resource>` (admin tenant-management)
  - Self: `/tenants/:tenantId/me/<resource>` (member self-service)
  - Public: `/<resource>/...` (no caller identity required)
- Global prefix `/api`, URI versioning default `v1` → final paths look
  like `/api/v1/tenants/:tenantId/me/pledges`.
- Bearer token: `Authorization: Bearer <Firebase ID token>`.

---

## 13. When you're about to edit — final checklist

Before you save changes:

1. Does the layer you're editing violate the dependency rules in §4?
2. Are you sharing a DTO across modules instead of extending a shared base?
3. Do new controllers/handlers have `@ApiOperation` + response decorator + role decorator?
4. Are new schema changes reflected in the shared DTO?
5. Did you add/update examples in `dto-examples.ts`?
6. Did you add `this.prisma.*` to a service? (Move it to a repo.)
   Did you hand-stamp `deletedAt: null` into a where clause? (Drop it —
   the extension auto-injects.) For soft-deletes, did you go through
   `entityService.delete(tenantId, id, actorId)` rather than calling
   the helper or `prisma.update` directly?
7. Did you forget `tenantId` on a tenant-scoped query?
8. Did you run `npm run prisma:generate` after editing the schema?

If all eight are clean, the change is safe to commit.
 
 ---

## 14. Integration testing

We use **Vitest + Testcontainers (Postgres)** for integration tests
that exercise the real database. There are no mocks at the Prisma layer
— every test runs against an ephemeral Postgres container so behaviors
like the soft-delete extension are verified end-to-end.

### Running

```bash
npm run test:integration         # one-shot
npm run test:integration:watch   # watch mode
```

First run pulls `postgres:16-alpine` (~5s on a fast connection); after
that the image is cached. A full suite takes ~10 seconds.

### Layout

```
test/
├── setup/
│   └── global-setup.ts       # boots ONE container per test run, applies
│                             # `prisma migrate deploy` against it
└── integration/
    └── <feature>.integration.test.ts
```

Test files share a single container; per-test isolation is handled by
truncating tables in `beforeEach` (see [test/helpers/db.ts](test/helpers/db.ts)).

### Conventions

- **Use the real `PrismaClientService`** via `makeTestClient()` — same
  proxy + extension wiring as production. Don't construct a bare
  `PrismaClient`; you'd miss the soft-delete behavior.
- **`beforeEach` truncates every table** — write seed helpers, don't
  rely on data carried over between tests.
- **Migrations apply via `prisma migrate deploy`**, not `db push` — so
  a broken migration fails the test suite, not only the prod deploy.
- **File naming**: `*.integration.test.ts` (Vitest's `include` pattern
  in [vitest.config.ts](vitest.config.ts)).
- **Test files live in `test/`**, NOT alongside source. The build
  config excludes `test/` so production bundles aren't polluted.

### When to add an integration test

- Behavior involves the database directly (soft-delete semantics,
  cascade behavior, partial unique indexes, migration correctness).
- The unit you're testing depends on Prisma's actual query shape — not
  a thin service wrapper around a repository.
- You're touching the soft-delete extension or the schema parser.

For pure-logic tests (DTO transforms, CASL rules, etc.), unit-level
Jest/Vitest mocks are fine — those don't belong in `test/integration/`.

 ---

 ## 15. Date Handling
 
 We exclusively use **dayjs** for all date manipulation, parsing, and arithmetic.
 
 - **Single Source of Truth:** Always import `dayjs` from `@shared/dayjs` to ensure plugins (UTC, etc.) are loaded.
 - **Prisma Compatibility:** When saving a date to a Prisma `DateTime` field, use `dayjs(val).toDate()`. Prisma expects native JS `Date` objects.
 - **No `new Date()`:** Do not use `new Date()` or `Date.now()`. Use `dayjs()` instead.
 - **UTC:** Prefer `dayjs.utc()` for calculations where timezone consistency is critical.

