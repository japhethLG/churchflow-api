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
goal into line items. The campaign's goal is the **sum** of its items'
`targetAmount` — there is no stored `goalAmount`. A **Pledge** is a
member's commitment toward either the overall campaign or a specific
item. A **Transaction** is a payment that can optionally reference a
pledge, item, and/or campaign; the feature service enforces consistency
(if `pledgeId` is given, it fully determines `campaignId` and
`campaignItemId`).

`Campaign.deadline` and `CampaignItem.deadline` are nullable. Null on a
campaign = open-ended. Null on an item = inherit the campaign's deadline
(resolved in the API layer, not stored).

Full product spec: [`../church-app/SPECS.md`](../church-app/SPECS.md).

---

## 2. Tech stack

| Layer | Tech | Notes |
|-------|------|-------|
| Framework | NestJS **11** | |
| Language | TypeScript 5.6 (strict) | |
| Build | **SWC** via `nest-cli -b swc` | typeCheck on; see [.swcrc](.swcrc) |
| Database | PostgreSQL | |
| ORM | Prisma **7** | multi-file schema under [prisma/schema/](prisma/schema/) |
| Prisma adapter | `@prisma/adapter-pg` | Prisma 7 requires `adapter` or `accelerateUrl` |
| Auth | **Firebase Admin SDK** | ID-token verification + custom claims only |
| Authorization | **CASL** | Single source of truth: [`ability.factory.ts`](src/infrastructure/authorization/ability.factory.ts) |
| Email | `nodemailer` | Gmail / Resend / console — auto-selected at boot |
| API docs | `@nestjs/swagger` + `@scalar/nestjs-api-reference` | Scalar UI `/api-docs`, JSON `/api-docs-json` |
| Validation | `class-validator` + `class-transformer` | global `ValidationPipe` (whitelist + forbidNonWhitelisted + transform + enableImplicitConversion) |
| Lint | Biome 2 | |

### Path aliases (tsconfig + .swcrc)

```
@infrastructure/*   → src/infrastructure/*
@modules/*          → src/modules/*
@shared/*           → src/shared/*
```

Always use aliases. Never deep relative imports.

---

## 3. Commands

```bash
npm run prisma:generate        # regenerate Prisma client (after schema edits)
npm run prisma:migrate         # create + apply dev migration
npm run prisma:deploy          # apply migrations in CI/prod
npm run prisma:studio          # GUI DB browser
npm run prisma:seed            # tsx prisma/seed.ts
npm run seed:super-admin       # promote a user to SUPER_ADMIN
npm run start:dev              # SWC watch mode on :8000
npm run build                  # production build via SWC
npm run lint / format / check  # Biome
npm run test:integration       # vitest + Postgres testcontainer
```

Docs: <http://localhost:8000/api-docs> · raw JSON `/api-docs-json`.

---

## 4. Architecture — the 5-tier rule

**Dependencies only flow downward.** Every circular-dep / god-service
problem traces back to breaking the rule below.

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
that was the original sin (`invoice → payment → invoice`). If two
entities need each other, that's a *feature* or *process* — not a core
module.

Mental model:
- **Feature:** "User clicked a button and now 5 things need to happen."
- **Process:** "These 3 steps always happen together regardless of who triggers them."
- **Core:** "I just need to read/write *one* table."
- **Infrastructure:** "I talk to something outside our database."

---

## 5. Directory layout

```
prisma/schema/              # Prisma 7 multi-file schema (auto-merged at build)
├── schema.prisma           # generator + datasource ONLY
├── user.prisma / tenant.prisma / member.prisma / campaign.prisma
├── pledge.prisma / transaction.prisma / invitation.prisma
└── audit.prisma            # AuditEvent — append-only

src/
├── main.ts                 # /api prefix, URI v1, CORS (exposes X-Claims-Refreshed),
│                           # ValidationPipe, ClaimsRefreshInterceptor +
│                           # GlobalResponseInterceptor, Scalar docs
├── main.module.ts          # wires every layer + global APP_GUARDs
├── main.controller.ts      # /health
├── swagger.config.ts       # setupSwagger(app)
│
├── infrastructure/         # Layer 0
│   ├── config/interceptors/
│   │   ├── global-response.interceptor.ts    # wraps in { success, data }
│   │   └── claims-refresh.interceptor.ts     # X-Claims-Refreshed: 1 (§9.5)
│   ├── prisma-client/      # PrismaClientService + soft-delete extension
│   ├── firebase-auth/
│   │   ├── firebase-admin.service.ts
│   │   ├── user-claims.service.ts            # writes tenantMemberships + isSuperAdmin
│   │   ├── decorators/                       # @Public, @Roles, @TenantRoles,
│   │   │                                     #   @CurrentUser, @CurrentTenant, @RefreshesClaims
│   │   ├── guards/                           # FirebaseAuthGuard, RolesGuard (global APP_GUARDs);
│   │   │                                     #   TenantGuard (opt-in)
│   │   └── types/auth-user.type.ts
│   ├── authorization/      # CASL
│   │   ├── ability.factory.ts                # createForTenant — single registry
│   │   ├── ability.types.ts                  # AppAbility, AppSubjects, Actions
│   │   ├── ability.interceptor.ts            # global APP_INTERCEPTOR — builds req.ability
│   │   ├── assert-can.ts                     # assertCan, asSubject helpers
│   │   ├── current-ability.decorator.ts
│   │   ├── policy.guard.ts                   # @CheckPolicy() for class-level checks
│   │   └── authorization.module.ts           # @Global
│   └── email/              # @Global — IEmailProvider + console/gmail/resend providers
│
├── shared/
│   ├── dto-examples.ts     # @ApiProperty example constants — SINGLE source of truth
│   └── dto/                # ONE response DTO per Prisma entity + filter base DTOs
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

## 6. Module anatomy — READ THIS BEFORE ADDING ANYTHING

The single most important section. Each layer has a specific shape.

### 6.1 Core module (`src/modules/core/<entity>/`)

**Purpose:** read/write *one* Prisma table, no cross-entity knowledge.

1. **`<entity>.types.ts`** — plain TS interfaces (`Create<Entity>Input`,
   `Update<Entity>Input`, `<Entity>Filters`). **NO** `class-validator`,
   **NO** `@ApiProperty` — this is internal, not an HTTP boundary.
2. **`repository/`** is the *only* file in the whole codebase that
   imports `Prisma` types **and** the *only* place that calls
   `this.prisma.*`. Services and features never touch `this.prisma`.
   - Inject `PrismaClientService`.
   - For tenant-scoped entities, methods filter by `tenantId`. **Do not**
     manually add `deletedAt: null` — the soft-delete extension auto-
     injects at every nesting depth (§8.3).
   - `update()` uses `where: { id }` (Prisma 7); tenant ownership is
     verified by the service's `getById()` before mutation.
   - `softDelete()` / `restore()` wrap the cascade-aware helpers (§8.3).
3. **`services/`** wraps the repo, throws `NotFoundException` for misses,
   enforces invariants. Takes the types-file interfaces. Never imports
   another core service.
4. **`<entity>.module.ts`** — declares repo + service; **exports only
   the service**. Class name `<Entity>CoreModule`.

**Reject in review:**
- Core service importing another core service → use a process/feature.
- `class-validator` decorators on `*.types.ts` → move to feature request DTOs.
- Prisma types outside `repository/`.
- `this.prisma.*` from a service. Exceptions: documented infra services
  that *cannot* import Core (e.g.
  [user-claims.service.ts](src/infrastructure/firebase-auth/user-claims.service.ts),
  [tenant.guard.ts](src/infrastructure/firebase-auth/guards/tenant.guard.ts)) —
  they carry an in-file comment explaining the trade-off.
- Hand-stamping `deletedAt: null` in a where clause.

### 6.2 Process module (`src/modules/processes/<name>-processing/`)

**Purpose:** reusable multi-step operation joining 2+ core entities. No
controllers — pure orchestration consumed by features.

1. Input interface lives **inside the service file**
   (`export interface IssueInvitationInput { … }`). No separate dto/.
2. Imports core modules; never features, never other processes.
3. Module imports the cores it uses, exports its service. Class name
   `<Name>ProcessingModule`.
4. Keep conditional branching *in the process*, not in the feature.

**Process vs feature:** if multiple features trigger the same multi-step
flow → process. If only one ever will → keep it in the feature service.
Don't preemptively extract.

### 6.3 Feature module (`src/modules/features/<name>-feature/`)

**Purpose:** HTTP-facing workflow. Controllers, request validation,
orchestration.

**Intent split — non-negotiable.** Controllers are organized by *intent*,
not role. The URL prefix declares scope; CASL enforces authorization:

- `platform/` → `/platform/*` — super-admin (no tenant context)
- `tenant/` → `/tenants/:tenantId/*` — admin tenant-management
- `self/` → `/tenants/:tenantId/me/*` — member self-service (any role)
- `public/` → `/<resource>/*` — token-based, no caller identity

**Controllers:**
- One `<entity>.<intent>.controller.ts` per intent folder.
- `@ApiTags('<plural> (<intent>)')` — e.g. `"pledges (tenant)"`.
- `@ApiBearerAuth('Bearer')` per intent (omit on `public/` lookup
  endpoints; keep on authenticated public endpoints like accept).
- Every handler injects `@CurrentAbility() ability: AppAbility` and
  calls `assertCan(ability, action, subject)` — class-level (string) or
  row-level (`asSubject('Foo', resource)`).
- `tenant/` and `self/` controllers apply `@UseGuards(TenantGuard)` and
  declare `@ApiParam({ name: 'tenantId' })` plus
  `@Controller('tenants/:tenantId/...')`.
- `platform/` controllers apply `@Roles('SUPER_ADMIN')` as defense-in-
  depth before the CASL check.
- Self controllers force `memberId` from `tenant.memberId` — request
  DTOs do not even accept `memberId`. If `tenant.memberId` is undefined,
  throw `NotFoundException` (super-admin without a Member row).
- Each `requests/`, `responses/`, `decorators/` folder ships an
  `index.ts` barrel. One class per file.

**Feature service:**
- **Unified — no per-intent split.** Authorization happens at the
  controller boundary via CASL; the service trusts pre-authorized input.
- **No role branching.** `if (tenant.role === ...)` is a controller
  responsibility now.
- Internal `<Verb><Entity>ServiceInput` interfaces; controllers translate
  HTTP DTOs into these.
- Orchestrates core/process services, validates invariants, records
  audit entries.
- Never imports another feature service.

**Feature module:**
- Imports the core/process modules it depends on.
- Declares all per-intent controllers + the unified service.
- Exports **nothing**.
- Class name `<Name>FeatureModule`.

### 6.4 Main module

- Imports `ConfigModule` (global), all infra modules, all cores,
  processes, features.
- Global `APP_GUARD`s in this order:
  1. `FirebaseAuthGuard` — verifies bearer token (skipped on `@Public()`).
  2. `RolesGuard` — enforces `@Roles('SUPER_ADMIN')`.
- `AbilityInterceptor` is registered as `APP_INTERCEPTOR` inside
  `AuthorizationModule` (colocated with authorization wiring).
- [`main.ts`](src/main.ts) sets `/api` prefix, URI versioning (`v1`
  default), CORS (with `X-Claims-Refreshed` exposed), the validation
  pipe, registers `ClaimsRefreshInterceptor` + `GlobalResponseInterceptor`
  as global interceptors, calls `setupSwagger(app)`.

### 6.5 Auth feature is exempt

`auth-feature/` does **not** follow the intent split. Auth endpoints
(`/auth/session`, `/auth/me`, `/auth/sign-out-everywhere`) are orthogonal
to tenant/role and have multi-step flows wrapped in the frontend's
`auth/actions.ts`. Keep the legacy `controllers/auth.controller.ts` +
`dto/` shape there.

### 6.6 Authorization — CASL is the only source of truth

Every authorization decision flows through
[`ability.factory.ts`](src/infrastructure/authorization/ability.factory.ts) —
the single registry for "who can do what." Edit it (and only it) when
granting or revoking a capability.

Pipeline:
1. `FirebaseAuthGuard` populates `req.user`.
2. `RolesGuard` enforces `@Roles('SUPER_ADMIN')` on platform routes.
3. `TenantGuard` resolves `:tenantId`, validates membership, populates
   `req.tenant: TenantContext`.
4. `AbilityInterceptor` builds `req.ability` from `tenant` (if present)
   or from `user.isSuperAdmin` (platform routes).
5. Controllers inject `@CurrentAbility()` and call
   `assertCan(ability, action, subject)`.

**Adding capabilities to a new entity:**
1. Add the Prisma model to `AppSubjects` in
   [`ability.types.ts`](src/infrastructure/authorization/ability.types.ts).
2. Register rules per role in `ability.factory.ts`. USER rules MUST
   carry a Prisma where-condition pinning the resource to
   `tenant.memberId` (or other identity field).
3. In controllers, `assertCan(ability, "<action>", asSubject("<Entity>", row))`
   for resource-level, or `assertCan(ability, "<action>", "<Entity>")`
   for class-level.

**Anti-patterns:**
- Reading `tenant.role` outside `ability.factory.ts`.
- `@TenantRoles('ADMIN')` on intent-split controllers — URL path + CASL covers it.
- Per-role helper methods in services (`ensureMemberVisibility`,
  `assertAdminOrSuperAdmin`) — these belong in the ability factory.
- Duplicating ability rules — there is exactly one `createForTenant`.

---

## 7. DTO conventions — the contract with the frontend

The frontend generates TypeScript types from `/api-docs-json`. Incorrect
decorators → wrong frontend types → runtime bugs.

### 7.1 The three DTO tiers

| Tier | Location | Purpose | Decorators | Validators? |
|------|----------|---------|------------|-------------|
| **Shared base** | [`src/shared/dto/<entity>.dto.ts`](src/shared/dto/) | One response DTO per Prisma model — canonical entity shape | `@Expose()` + `@ApiProperty()` | ❌ |
| **Feature request** | `features/<x>/dto/*.request.dto.ts` | HTTP input for one endpoint | `@ApiProperty()` + `@Is*()` | ✅ |
| **Feature response** | `features/<x>/dto/*.response.dto.ts` | HTTP output for one endpoint | usually `extends Shared` via `PickType`/`OmitType` + extras | ❌ |

Core `<entity>.types.ts` is NOT a DTO tier — it's the internal service
contract.

### 7.2 Why we don't share DTOs across modules

- Cross-feature DTO imports → editing feature B's DTO silently changes
  feature A's API.
- Shared **response** DTOs are fine because they represent the entity,
  not any feature's endpoint.
- Each feature owns its controller-level DTOs; when it needs the
  entity's shape, it `extends` the shared base.

### 7.3 Shared base DTOs

One file per Prisma model. Every field gets `@Expose()` (for
`class-transformer`) + `@ApiProperty({ example })` or
`@ApiPropertyOptional({ example, nullable })`.

Examples come from [`src/shared/dto-examples.ts`](src/shared/dto-examples.ts).
**Add new constants there** — never hard-code examples.

```ts
export class TenantDto {
  @Expose() @ApiProperty({ example: ID_EXAMPLE })
  id!: string;

  @Expose() @ApiPropertyOptional({ example: ADDRESS_EXAMPLE, nullable: true })
  address!: string | null;
}
```

- **Nullable:** `@ApiPropertyOptional({ nullable: true })` + `| null`.
- **Enums:** `@ApiProperty({ enum: MemberRole, example: MemberRole.USER })`.
- **Prisma `Decimal`:** transform to number so the JSON is a number, not the object:
  ```ts
  @Expose()
  @Transform(({ value }) => (value instanceof Prisma.Decimal ? value.toNumber() : value))
  @ApiProperty({ example: AMOUNT_EXAMPLE })
  amount!: number;
  ```

### 7.4 Feature request DTOs

Per-endpoint input. Both `@ApiProperty()` and `@Is*()` validators. Use
`PartialType(CreateFooRequestDto)` for updates — preserves metadata AND
makes every field optional.

**Do NOT** extend `TenantDto` for requests — shared base DTOs have
`@ApiProperty` but no validators; `PickType` would lose validation.
Declare the request shape fresh, or `PickType(CreateTenantRequestDto, [...])`.

**Query/filter DTOs** go in the request file. Use `@Type(() => Number)` /
`@Type(() => Date)` for query-string coercion (the global pipe has
`transform: true, enableImplicitConversion: true`).

### 7.5 Feature response DTOs

Extend the shared base via `PickType` / `OmitType` / `IntersectionType`
from **`@nestjs/swagger`** (not `class-transformer` — those don't preserve
Swagger metadata).

```ts
export class TenantResponseDto extends TenantDto {}

export class TenantSummaryResponseDto extends PickType(TenantDto, ['id', 'name', 'logoUrl'] as const) {}

export class TenantListResponseDto {
  @Expose() @Type(() => TenantResponseDto)
  @ApiProperty({ type: [TenantResponseDto] })
  items!: TenantResponseDto[];

  @Expose() @Type(() => MetaDto)
  @ApiProperty({ type: MetaDto })
  meta!: MetaDto;
}
```

For aggregates (e.g. `sum` for transactions), extend `MetaDto` rather
than inventing a new meta class.

### 7.6 Controller decorators

Every handler **must** declare a response type via `@ApiOkResponse` /
`@ApiCreatedResponse` / `@ApiNoContentResponse`. Plus `@ApiOperation`,
`@ApiParam` for every `:param`, `@ApiBearerAuth('Bearer')` where auth is
needed, and error responses (`@ApiBadRequestResponse`, etc.) when the
endpoint can return them for non-trivial reasons.

### 7.7 Shared filter base DTOs

List endpoints repeatedly accept the same three query-string contracts.
Each has a single shared base in `src/shared/dto/`:

| Shared base | Fields |
|---|---|
| `StateFilterRequestDto` | `includeDeleted`, `onlyDeleted` (3-state archive filter) |
| `DateRangeRequestDto` | `dateFrom`, `dateTo` (both inclusive, ISO 8601 UTC) |
| `PaginationRequestDto` | `offset`, `limit` |

Compose only what you need:

```ts
export class PledgeFiltersRequestDto extends IntersectionType(
  StateFilterRequestDto,
  DateRangeRequestDto,
  PaginationRequestDto,
) {
  @ApiPropertyOptional({ enum: PledgeStatus })
  @IsOptional() @IsEnum(PledgeStatus)
  status?: PledgeStatus;
}
```

**Overriding a field** — to tighten an inherited field (e.g. cap
`limit` at 200 on the audit log), use `OmitType` to drop it, then
redeclare locally:

```ts
export class AuditEventsQueryRequestDto extends IntersectionType(
  DateRangeRequestDto,
  OmitType(PaginationRequestDto, ["limit"] as const),
) {
  @ApiPropertyOptional({ example: 50, maximum: 200 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200)
  limit?: number;
}
```

Do NOT redeclare an inherited field without `OmitType` — TS rejects it
(TS2612) and a `declare` workaround strips decorators so class-validator
silently drops rules.

**Document the column the range applies to** in the DTO's leading
comment (`createdAt` on pledges/campaigns/audit/invitations,
`Transaction.date` on transactions). Repositories apply the range
directly to that column.

`/transactions/summary` is a hybrid: extends `DateRangeRequestDto` and
adds a legacy `months` rolling-window fallback — when `dateFrom`/`dateTo`
are present the explicit range wins. Invitations list returns every
status by default; pass `status=PENDING` to scope.

### 7.8 File naming (intent-split features)

- One **class per file**.
- Requests: `<verb>-<entity>.request.ts` → class `CreatePledgeRequestDto`.
- Responses: `<entity>.response.ts` or `<entity>-<variant>.response.ts`.
- Self-intent DTOs use `My...` prefix (`MyPledgeResponseDto`).
- Each `requests/`/`responses/`/`decorators/` folder ships an `index.ts` barrel.
- Auth feature is exempt — keep its legacy `dto/<noun>.request.dto.ts` shape.

---

## 8. Prisma — schema, migrations, client

### 8.1 Multi-file schema

Split across [`prisma/schema/`](prisma/schema/) — one file per
entity/domain group. Prisma 7 merges every `*.prisma` at build time.

- `schema.prisma` holds **only** `generator` + `datasource`.
- Enums live in the file of the model they belong to.
- Cross-file relations just work — no import syntax.
- Wired via [`prisma.config.ts`](prisma.config.ts): `schema: 'prisma/schema'`.

### 8.2 Prisma 7 specifics

- `DATABASE_URL` is NOT in `schema.prisma`'s `datasource` (Prisma 7
  removed that). Injected via `prisma.config.ts` using `env('DATABASE_URL')`.
- `PrismaClientService` uses the **`PrismaPg` adapter** and passes
  `{ adapter }` to `super()` (Prisma 7 requires `adapter` or
  `accelerateUrl`).
- After schema edits, `npm run prisma:generate` to regenerate types.
- `npm run prisma:migrate` in dev.

### 8.3 Soft delete

Every soft-deletable entity has three columns: `deletedAt: DateTime?`,
`deletedBy: String?`, `deletedByCascade: Boolean @default(false)`. The
extension lives at
[`src/infrastructure/prisma-client/soft-delete/`](src/infrastructure/prisma-client/soft-delete/),
applied via proxy in
[prisma-client.module.ts](src/infrastructure/prisma-client/prisma-client.module.ts),
so repos that inject `PrismaClientService` get the behavior free.

**What the extension does:**

| Operation | Behavior |
|---|---|
| `findMany`/`findFirst[OrThrow]`/`count`/`aggregate`/`groupBy` | Inject `deletedAt: null` into `where` — tombstones excluded |
| `findUnique[OrThrow]` | Post-query check; widens `select`/`omit` to include `deletedAt` so a custom projection can't fail open |
| `update`/`updateMany[AndReturn]`/`upsert`/`delete`/`deleteMany` | Inject `deletedAt: null` into `where` — tombstones immutable |
| `create`/`createMany[AndReturn]` | Pass through |

**Escape hatch:** include `deletedAt` explicitly in your `where`. Any
value works — `undefined` for "all rows", `{ not: null }` for "only
tombstones". `restore` uses this to reach into the tombstone set.

**Relations are filtered too** — industry-standard, matching
Laravel/Rails/Django. A single walker recurses through `include` /
`select` / `where` / `_count` and injects `deletedAt: null` at every
relation that targets a soft-deletable model:

- To-many → only active items returned.
- Optional to-one → `null` if the related row is archived.
- Required to-one → Prisma's `XxxDefaultArgs` has no `where`, so the
  extension can't filter without lying about non-null types. Tombstones
  surface here; callers must inspect `joined.X.deletedAt`. (Prisma
  constraint, not a design choice.)
- Relation predicates in top-level `where` (inside `AND`/`OR`/`NOT` and
  `some`/`every`/`none`) get the same auto-filter.
- `_count` (shorthand and object form) counts only active rows.

**`withDeleted(modelName, args)` — opt-in to tombstones** (Laravel/Rails
escape hatch). Pre-seeds `deletedAt: undefined` through the entire query
tree:

```ts
import { withDeleted } from "@infrastructure/prisma-client/soft-delete";

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
Prisma schema — catches typos that would silently leak tombstones.

**The `softDelete` / `restore` helpers — repository layer only.** The
helpers in
[soft-delete.helpers.ts](src/infrastructure/prisma-client/soft-delete/soft-delete.helpers.ts)
are invoked by repos, not services or features. Each soft-deletable
entity exposes the operation through three layers:

```text
Feature/Process service
        ▼  resolves internal User.id from firebase UID, passes as actorId
Core service.delete(tenantId, id, actorId)   ← throws NotFoundException on miss
        ▼
Core repository.softDelete(tenantId, id, actorId)   ← wraps the helper
        ▼
softDelete(tx, "Model", { where, actorId })   ← runs cascade in $transaction
```

> **`actorId` is the internal `User.id`, NOT the firebase UID.** Stamping
> the FK to our own `User` table makes "who deleted this" answerable
> without a Firebase round-trip and survives a Firebase account deletion.
> `AuditEvent.actorUid` keeps the firebase UID separately for the audit
> trail — same actor, two identifiers.

```ts
// Feature service — resolves User.id before calling core service
const actor = await this.userService.findByFirebaseUid(user.firebaseUid);
const campaign = await this.campaignService.delete(tenant.tenantId, id, actor?.id ?? null);
await this.auditService.record({ ..., actorUid: user.firebaseUid });

// Core service — thin wrapper preserving NotFound semantics
async delete(tenantId: string, id: string, actorId: string | null) {
  await this.getById(tenantId, id);
  return this.campaignRepository.softDelete(tenantId, id, actorId);
}

// Core repository — only place the helper is called
async softDelete(tenantId: string, id: string, actorId: string | null) {
  return this.prisma.$transaction(async (tx) => {
    await softDelete(tx, "Campaign", { where: { id, tenantId }, actorId });
    return tx.campaign.findFirstOrThrow(withDeleted("Campaign", { where: { id, tenantId } }));
  });
}
```

`restore` mirrors this. Restore-capable entities (Campaign, Tenant)
expose `service.restore(...)` → `repository.restore(...)` → `restore(tx, "Model", ...)`.

Cascade discovery reads `@relation(..., onDelete: Cascade)` from the
`.prisma` files at startup (Prisma 7 strips `relationOnDelete` from
runtime DMMF). Composition relations cascade; association relations
don't. `deletedByCascade` distinguishes "cascaded by this parent" from
"independently deleted" so `restore` doesn't resurrect rows the admin
intentionally archived earlier.

**Deployment:** the extension reads `prisma/schema/*.prisma` at first
use. The schema directory must be present at runtime in production. If
your Docker image strips non-`src/` files, set `SOFT_DELETE_SCHEMA_DIR`
or include `prisma/schema/` in the image.

**Adding a new soft-deletable model:**
1. Add `deletedAt`, `deletedBy`, `deletedByCascade` columns.
2. Generate migration. If the model has unique constraints whose
   identifier should be reclaimable after archive (e.g. a tenant-scoped
   email), edit the migration to make those uniques **partial**:
   `CREATE UNIQUE INDEX "..._key" ON "Table"(...) WHERE "deletedAt" IS NULL`.
   Keep Prisma's chosen index name so `upsert` keeps working.
3. If the model is a composition child of another soft-deletable,
   add `onDelete: Cascade` to the `@relation` — picked up automatically.
4. Add `softDelete(tenantId, id, actorId)` to the repo (calls the helper
   in `$transaction`, returns the tombstone via `withDeleted`). Expose
   `delete(tenantId, id, actorId)` on the core service.
5. Feature handlers resolve internal User.id via
   `userService.findByFirebaseUid(user.firebaseUid)` before calling
   `entityService.delete(..., actor?.id ?? null)`; audit record still
   uses `user.firebaseUid` as `actorUid`.

**Anti-patterns:** all consolidated in §11.

### 8.4 Tenant scoping

All tenant-owned entities have `tenantId: String`. Every repository
method that returns tenant-owned data takes `tenantId` as its first
argument and filters on it. This is the line of defense against cross-
church data leaks.

---

## 9. Firebase auth

We use Firebase for authentication only (ID-token verification + custom
claims). No Firestore, FCM, or Storage.

### 9.1 Flow — there is no "active tenant" claim

The active tenant is **derived from the URL** (`/tenants/:tenantId/...`),
never stored in custom claims. No `switch-tenant` endpoint. A Firebase
user carries a snapshot of every tenant they belong to via the
`tenantMemberships` claim, keyed by tenant slug.

1. Frontend does Google SSO via Firebase client SDK → ID token.
2. Frontend calls `POST /api/v1/auth/session` with `{ idToken }`.
3. `AuthController.createSession` (`@Public()`) verifies, upserts global
   `User`, snapshots memberships into custom claims via
   `UserClaimsService.refreshFor`, returns the populated session.
4. Frontend sends `Authorization: Bearer <idToken>` on subsequent requests.
5. `FirebaseAuthGuard` (global) verifies on every non-`@Public()` request
   and attaches `AuthUser` to `req.user`.
6. Routes under `/tenants/:tenantId/...` apply `@UseGuards(TenantGuard)`.
   `TenantGuard` resolves `:tenantId` (UUID or slug), checks
   `user.tenantMemberships[tenant.slug]` (or `isSuperAdmin`), optionally
   enforces `@TenantRoles('ADMIN')`, writes `req.tenant: TenantContext`.
7. Handlers that change the caller's own claims should be marked
   `@RefreshesClaims()`. `ClaimsRefreshInterceptor` sets
   `X-Claims-Refreshed: 1` on the response; the frontend force-refreshes
   the ID token + re-mints the Next session cookie — no manual
   `refreshSession()` call required.

### 9.2 Decorators

```ts
@Public()                       // skip auth entirely (login, health, /invitations/lookup)
@Roles('SUPER_ADMIN')           // platform-level (RolesGuard, global)
@TenantRoles('ADMIN')           // tenant-scoped (TenantGuard, requires @UseGuards(TenantGuard))
@RefreshesClaims()              // sets X-Claims-Refreshed: 1 on success
@CurrentUser() user: AuthUser
@CurrentTenant() tenant: TenantContext  // only on @UseGuards(TenantGuard) routes
@CurrentAbility() ability: AppAbility
```

Shapes (from
[`auth-user.type.ts`](src/infrastructure/firebase-auth/types/auth-user.type.ts)):

```ts
type TenantRole = "ADMIN" | "USER";

interface TenantMembershipClaim {
  memberId: string;
  role: TenantRole;
  name: string;     // tenant display name
}

interface AuthUser {
  firebaseUid: string;
  email: string;
  displayName?: string;
  picture?: string;
  isSuperAdmin: boolean;
  tenantMemberships: Record<string, TenantMembershipClaim>;  // keyed by tenant slug
}

// Built per-request by TenantGuard. memberId/role are undefined for
// super-admins without a Member row in this tenant.
interface TenantContext {
  tenantId: string;          // always the UUID
  slug: string;
  memberId?: string;
  role?: TenantRole;
}
```

### 9.3 Guard / interceptor order

`APP_GUARD`s (main.module.ts):
1. `FirebaseAuthGuard` → `req.user` or 401 (unless `@Public()`).
2. `RolesGuard` → enforces `@Roles('SUPER_ADMIN')`.

`TenantGuard` is opt-in via `@UseGuards(TenantGuard)`.

Global interceptors (from [`main.ts`](src/main.ts)):
1. `ClaimsRefreshInterceptor` — reads `@RefreshesClaims()` metadata, sets the header.
2. `GlobalResponseInterceptor` — wraps successful bodies in `{ success: true, data }`.
3. `AbilityInterceptor` (registered as `APP_INTERCEPTOR` in
   `AuthorizationModule`) — builds `req.ability`.

### 9.4 Firebase credentials

`FIREBASE_SERVICE_ACCOUNT_PATH` points to a service-account JSON, OR
set `FIREBASE_PROJECT_ID` + `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY`.
See [.env.example](.env.example).

### 9.5 The `X-Claims-Refreshed` contract

CORS in `main.ts` whitelists `X-Claims-Refreshed` under `exposedHeaders`
so browser JS can read it. The frontend's response middleware triggers a
session-cookie remint when it sees the header — every handler that
mutates the caller's own membership/role/super-admin status MUST be
tagged `@RefreshesClaims()` so the frontend doesn't run on stale claims.

Do **not** add `@RefreshesClaims()` to a handler that mutates *another*
user's claims — those users' devices update on their own next token
refresh.

---

## 10. Adding a Prisma entity — the only workflow worth listing

1. Create `prisma/schema/<entity>.prisma`.
2. `npm run prisma:migrate -- --name add-<entity>` then `prisma:generate`.
3. Create `src/shared/dto/<entity>.dto.ts` — full response DTO, every
   column with `@Expose()` + `@ApiProperty()`. Add constants to
   `src/shared/dto-examples.ts`.
4. Create the core module (§6.1): `<entity>.types.ts`,
   `repository/<entity>.repository.ts`, `services/<entity>.service.ts`,
   `<entity>.module.ts` (exports service only).
5. Register in `main.module.ts`'s `coreModules` array.
6. If it needs authorization, add to `AppSubjects` in
   `ability.types.ts` and register rules in `ability.factory.ts`.
7. Add a feature module per §6.3 to expose HTTP endpoints.

For other workflows (new endpoint on existing feature, new feature
module, new process), follow the section that defines that layer —
those instructions live in §6 and §7 and aren't repeated here.

---

## 11. Anti-patterns — do NOT do these

| Anti-pattern | Fix |
|--------------|-----|
| Feature imports another feature's DTO | Extend shared base instead |
| Core service imports another core service | Lift the join to a feature or process |
| `class-validator` on `<entity>.types.ts` | Move to the feature request DTO |
| Prisma types outside a repository | Move to the repository, expose a plain interface |
| Service calls `prismaService.xxx` directly | Route through repository. Exceptions documented in §6.1 |
| Hand-stamping `deletedAt: null` / `tenant: { deletedAt: null }` into a where clause | Drop it — the extension auto-injects at every nesting depth (including `AND`/`OR`/`NOT`, `some`/`every`/`none`, relation predicates in `where`) |
| Soft-deleting via `prisma.x.update({ data: { deletedAt: dayjs().toDate() } })` | Use `entityService.delete(tenantId, id, actorId)` — skips cascade, skips `deletedBy`, and is blocked by the extension once the row is a tombstone |
| `upsert` to "find or restore" an archived row | Upsert creates a fresh row in the freed slot (partial unique allows it). Restore the tombstone explicitly to preserve linked history |
| Calling `softDelete`/`restore`/`withDeleted` from a feature/process service | Wrap them in a repo method (e.g. `findByIdIncludingDeleted`); expose through the core service |
| Passing `user.firebaseUid` as `actorId` to `service.delete(...)` | `deletedBy` stores internal `User.id`; firebase UID only lives on `AuditEvent.actorUid`. Resolve via `userService.findByFirebaseUid` first |
| Forgetting to thread `actorId` through `service.delete(...)` | `deletedBy` ends up NULL on the tombstone |
| Assuming `pledge.campaign` is non-null when the campaign might be archived | Required to-one relations surface tombstones; check `pledge.campaign.deletedAt` |
| Threading `deletedAt: undefined` through nested `include` by hand | Use `withDeleted(modelName, args)` |
| `$queryRaw` over soft-deletable tables | Raw SQL bypasses the extension and returns tombstones; use `groupBy` / `aggregate` / `findMany`-plus-JS-bucket |
| Handler without `@ApiOperation` or response decorator | OpenAPI contract is incomplete; add them |
| Reading `tenant.role` outside `ability.factory.ts` | Use `assertCan(ability, action, subject)` |
| Per-role helpers in services (`ensureMemberVisibility`, `assertAdminOrSuperAdmin`) | Move into `ability.factory.ts`; controllers call `assertCan` |
| `@TenantRoles` on intent-split controllers | URL path + CASL covers it — drop |
| Putting an admin-management endpoint under `controllers/self/` (or vice versa) | Intent declares scope; pick the folder that matches the *URL meaning* |
| Self-controller request DTO accepts `memberId` | Self DTOs MUST omit it; `memberId` comes from `tenant.memberId` |
| Tenant-scoped endpoint that doesn't filter by `tenantId` | Security bug — add it |
| Trusting `campaignId`/`campaignItemId` when `pledgeId` is also set | Resolve via the pledge; reject mismatches (see `TransactionFeatureService.resolveAttribution`) |
| `Transaction.campaignItemId` without `campaignId` | Reject — an item without its campaign is meaningless |
| `@ApiProperty` with a made-up example | Reuse / add a constant in `dto-examples.ts` |
| Swapping `@nestjs/swagger`'s `PickType` for `class-transformer`'s | Loses `@ApiProperty` metadata |
| Redeclaring `includeDeleted` / `onlyDeleted` / `dateFrom` / `dateTo` / `offset` / `limit` on a list filter DTO | Compose the shared bases via `IntersectionType` (§7.7) |
| Filter DTO that doesn't say which column its `dateFrom`/`dateTo` brackets | Document in DTO comment |
| `npm run build` without `prisma:generate` after schema edits | Type errors on `@prisma/client` imports |

---

## 12. Pre-commit checklist

1. Layer dependencies respect §4?
2. No DTO shared across feature modules (only via shared base)?
3. New controllers/handlers: `@ApiOperation` + response decorator + role decorator?
4. Schema changes reflected in the shared DTO? Examples in `dto-examples.ts`?
5. Did you add `this.prisma.*` to a service? (Move to a repo.) Hand-stamp
   `deletedAt: null` anywhere? (Drop it.) Soft-delete goes through
   `entityService.delete(tenantId, id, actorId)` — not the helper directly?
6. Tenant-scoped queries filter by `tenantId`?
7. Did you run `npm run prisma:generate` after schema edits?
8. `npm run check` + `npm run test:integration` green?

---

## 13. Integration testing

**Vitest + Testcontainers (Postgres).** No mocks at the Prisma layer —
tests run against an ephemeral Postgres so behaviors like the soft-
delete extension are verified end-to-end.

```bash
npm run test:integration         # one-shot
npm run test:integration:watch
```

First run pulls `postgres:16-alpine`; full suite ~10 seconds.

```
test/
├── setup/global-setup.ts        # boots ONE container per run, applies
│                                # `prisma migrate deploy`
└── integration/<feature>.integration.test.ts
```

Files share one container; per-test isolation via truncate in
`beforeEach` (see [test/helpers/db.ts](test/helpers/db.ts)).

**Conventions:**
- Use the real `PrismaClientService` via `makeTestClient()` — same
  proxy + extension wiring as prod. Don't construct a bare `PrismaClient`.
- `beforeEach` truncates every table — write seed helpers.
- Migrations apply via `prisma migrate deploy`, not `db push`.
- File naming: `*.integration.test.ts`.
- Test files live in `test/`, NOT alongside source.

**When to add one:** soft-delete semantics, cascade behavior, partial
unique indexes, migration correctness, anything that depends on
Prisma's actual query shape. For pure-logic tests (DTO transforms, CASL
rules), unit-level mocks are fine.

---

## 14. Date handling

Exclusively **dayjs** for all date manipulation.

- Import from `@shared/dayjs` to ensure plugins (UTC, etc.) are loaded.
- **Prisma compatibility:** when saving to a Prisma `DateTime` field,
  use `dayjs(val).toDate()` — Prisma expects native `Date`.
- **No `new Date()` / `Date.now()`** — use `dayjs()`.
- Prefer `dayjs.utc()` for timezone-critical calculations.
