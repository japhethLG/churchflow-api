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
| Auth | **Firebase Admin SDK** | ID-token verification only — no other Firebase services |
| API docs | `@nestjs/swagger` + `@scalar/nestjs-api-reference` | Scalar UI at `/api-docs`, raw OpenAPI JSON at `/api-docs-json` |
| Validation | `class-validator` + `class-transformer` | global `ValidationPipe` with `whitelist: true, forbidNonWhitelisted: true, transform: true` |

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
npm run prisma:studio          # GUI DB browser
npm run start:dev              # SWC watch mode on :8000
npm run build                  # production build via SWC
npm run lint                   # biome lint .
npm run format                 # biome format . --write
npm run check                  # biome check --write .
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
└── invitation.prisma       # Invitation + InvitationStatus

src/
├── main.ts                 # bootstrap — prefix /api, version v1, Scalar docs, ValidationPipe
├── main.module.ts          # wires every layer + global APP_GUARDs
├── main.controller.ts      # /health
├── swagger.config.ts       # setupSwagger(app) — Scalar + /api-docs-json
│
├── infrastructure/         # Layer 0
│   ├── config/interceptors/
│   │   └── global-response.interceptor.ts
│   ├── prisma-client/      # PrismaClientService (extends PrismaClient, uses PrismaPg adapter)
│   └── firebase-auth/      # FirebaseAdminService, guards, decorators
│       ├── decorators/     # @Public, @Roles, @CurrentUser
│       ├── guards/         # FirebaseAuthGuard (global), RolesGuard (global)
│       ├── strategies/     # (reserved for future Passport strategies, currently empty)
│       └── types/          # AuthUser
│
├── shared/                 # cross-module building blocks (response DTOs live here)
│   ├── dto-examples.ts     # @ApiProperty example constants — SINGLE source of truth
│   └── dto/
│       ├── user.dto.ts     # ONE response DTO per Prisma entity
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
    │   │   ├── user.types.ts           # INTERNAL input interfaces (not classes)
    │   │   ├── repository/user.repository.ts
    │   │   ├── services/user.service.ts
    │   │   └── user.module.ts          # exports only the Service
    │   ├── tenant/    …
    │   ├── member/    …
    │   ├── campaign/      …
    │   ├── campaign-item/ …
    │   ├── pledge/        …
    │   ├── transaction/   …
    │   └── invitation/    …
    │
    ├── processes/          # Layer 2
    │   └── invitation-processing/
    │       ├── services/invitation-processing.service.ts
    │       └── invitation-processing.module.ts   # exports the Service only
    │
    └── features/           # Layer 3
        ├── auth-feature/
        │   ├── controllers/auth.controller.ts
        │   ├── services/auth-feature.service.ts
        │   ├── dto/
        │   │   ├── *.request.dto.ts        # input shapes (validators + @ApiProperty)
        │   │   └── *.response.dto.ts       # output shapes (extend shared)
        │   └── auth-feature.module.ts
        ├── tenant-feature/
        ├── campaign-feature/     # nested items under /campaigns/:id/items
        ├── pledge-feature/
        ├── transaction-feature/  # validates campaign/item/pledge attribution
        └── invitation-feature/
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
   codebase that imports `Prisma` types (`Prisma.XxxWhereInput`, etc.).
   - Inject `PrismaClientService`.
   - For tenant-scoped entities, `findById(tenantId, id)` etc. must
     filter by `tenantId` AND `deletedAt: null` (soft delete).
   - `update()` / `softDelete()` use `where: { id }` (Prisma 7 requires a
     unique `where`) — tenant ownership is verified by the service's
     `getById()` call **before** mutation.
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
- ❌ Skipping `deletedAt: null` in a read query (soft-deleted rows leak into the API).

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

**Purpose:** HTTP-facing workflow. This is where controllers live, where
requests are validated, and where multiple core/process services are
orchestrated.

**Required files:**

```
modules/features/<name>-feature/
├── controllers/<name>.controller.ts
├── services/<name>-feature.service.ts
├── dto/
│   ├── <name>.request.dto.ts           # request DTOs (one file, multiple classes OK)
│   └── <name>.response.dto.ts          # response DTOs
└── <name>-feature.module.ts
```

**Rules:**

1. **Controller**
   - `@ApiTags('<plural-noun>')` — grouping in Scalar.
   - `@ApiBearerAuth('Bearer')` on the class when ALL handlers need auth.
     If only some do, apply per-handler.
   - `@Controller('<resource>')` — the `/api/v1` prefix is applied globally.
   - Every handler has `@ApiOperation({ summary })` and a response decorator
     (`@ApiOkResponse`, `@ApiCreatedResponse`, `@ApiNoContentResponse`) with
     a concrete `type`.
   - Path params get `@ApiParam({ name })`.
   - Handlers are thin — delegate to the feature service.
   - Use `@CurrentUser()` to inject the authenticated user, `@Roles(...)` to
     gate access, `@Public()` to opt out of auth entirely.
2. **Feature service**
   - Orchestrates core/process services.
   - Handles cross-cutting authorization that needs more context than
     `@Roles` alone (e.g., "user can only see their own transactions").
   - Maps feature DTOs → core input interfaces (spread `...body` + add fields).
   - NEVER imports another feature service.
3. **Feature module**
   - Imports the core/process modules it depends on.
   - Declares controllers + the feature service.
   - Does **not** export anything — features are leaves.
   - Module class name is `<Name>FeatureModule`. File name is
     `<name>-feature.module.ts`.

### 6.4 Main module (`src/main.module.ts`)

- Imports `ConfigModule` (global), all infra modules, all core modules, all
  process modules, all feature modules.
- Registers global `APP_GUARD`s in this order:
  1. `FirebaseAuthGuard` — verifies the bearer token (skipped on `@Public()`).
  2. `RolesGuard` — enforces `@Roles(...)` metadata.
- Registers `GlobalResponseInterceptor` (wraps responses in `{ success: true, data }`).
- Bootstrap file `main.ts` sets the `/api` prefix, URI versioning (`v1`
  default), CORS, the validation pipe, and calls `setupSwagger(app)`.

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

### 7.7 File naming

- Requests: `<noun>.request.dto.ts` (can contain multiple classes per endpoint).
- Responses: `<noun>.response.dto.ts`.
- When a feature has multiple resources, use one file per resource
  (`tenant.request.dto.ts`, `member.request.dto.ts`).

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

### 8.3 Soft delete

Every entity has `deletedAt: DateTime?`. Read queries MUST filter
`deletedAt: null`. Delete operations set `deletedAt: dayjs().toDate()` rather
than hard-deleting.

There is currently no Prisma extension automating this — repositories do it
explicitly. If you add a new repository method, add the filter.

### 8.4 Tenant scoping

All tenant-owned entities have `tenantId: String`. Every repository method
that returns tenant-owned data takes `tenantId` as its first argument and
filters on it. This is the line of defense against data leaks across
churches.

---

## 9. Firebase auth

**We use Firebase for authentication only** (ID token verification + custom
claims). No Firestore, no FCM, no Storage.

### 9.1 Flow

1. Frontend does Google SSO via Firebase client SDK → gets an ID token.
2. Frontend calls `POST /api/v1/auth/session` with `{ idToken }`.
3. `AuthController.createSession` (marked `@Public()`) verifies the token,
   upserts a `User`, and returns the session.
4. Frontend stores the ID token and sends it as `Authorization: Bearer <idToken>`
   on subsequent requests.
5. `FirebaseAuthGuard` (global `APP_GUARD`) verifies the token on every
   non-`@Public()` request and attaches `AuthUser` to `req.user`.
6. When the user picks which tenant to operate in, frontend calls
   `POST /api/v1/auth/switch-tenant`, which sets custom claims
   (`tenantId`, `memberId`, `role`, `isSuperAdmin`) on the Firebase user. The
   next token refresh includes these claims.

### 9.2 Decorators on controllers

```ts
@Public()                   // skip auth entirely (login, health, public pages)
@Roles('ADMIN')             // require tenant admin
@Roles('SUPER_ADMIN')       // require super admin
@Roles('ADMIN', 'SUPER_ADMIN') // either works
@CurrentUser() user: AuthUser  // param decorator — injects the auth user
```

`AuthUser` shape:

```ts
interface AuthUser {
  firebaseUid: string;
  email: string;
  displayName?: string;
  picture?: string;
  tenantId?: string;      // from custom claims — set after switch-tenant
  memberId?: string;
  role?: 'ADMIN' | 'USER';
  isSuperAdmin?: boolean;
}
```

### 9.3 Guard order matters

Registered as `APP_GUARD` in this order in `main.module.ts`:
1. `FirebaseAuthGuard` — populates `req.user` (or throws 401).
2. `RolesGuard` — reads `@Roles()` metadata, checks `req.user.role`.

Do not reverse the order. `RolesGuard` assumes `FirebaseAuthGuard` has run.

### 9.4 When auth is provided via env

`FIREBASE_SERVICE_ACCOUNT_PATH` points to a service-account JSON, OR set
the three variables `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`,
`FIREBASE_PRIVATE_KEY`. See [.env.example](.env.example).

---

## 10. Common workflows

### 10.1 Add a new Prisma entity

1. Create `prisma/schema/<entity>.prisma` with the model and any enums.
2. `npx prisma migrate dev --name add-<entity>` — creates + applies the migration.
3. Create `src/shared/dto/<entity>.dto.ts` — full response DTO mirroring
   every column, with `@Expose()` + `@ApiProperty()`. Use/add constants in
   `src/shared/dto-examples.ts`.
4. Create the core module:
   - `src/modules/core/<entity>/<entity>.types.ts`
   - `src/modules/core/<entity>/repository/<entity>.repository.ts`
   - `src/modules/core/<entity>/services/<entity>.service.ts`
   - `src/modules/core/<entity>/<entity>.module.ts` (exports service only)
5. Register the core module in `main.module.ts`'s `coreModules` array.

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
   ├── controllers/<name>.controller.ts
   ├── services/<name>-feature.service.ts
   ├── dto/<name>.request.dto.ts
   ├── dto/<name>.response.dto.ts
   └── <name>-feature.module.ts
   ```
2. In the feature module, import the core/process modules it depends on,
   declare the controller, provide the service, and do NOT export anything.
3. Register in `main.module.ts`'s `featureModules` array.

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
| Controller calls `prismaService.xxx` directly | Route through core service → repository |
| Handler without `@ApiOperation` or response decorator | Add them — OpenAPI contract is incomplete otherwise |
| Feature service without `@Roles` on admin-only endpoints | Add `@Roles('ADMIN')` or `@Roles('SUPER_ADMIN')` |
| Read query without `deletedAt: null` filter | Add the filter |
| Tenant-scoped endpoint that doesn't filter by `tenantId` | Add the filter — this is a security bug |
| Trusting `campaignId`/`campaignItemId` from the client when `pledgeId` is also set | Always resolve via the pledge; reject mismatches (see `TransactionFeatureService.resolveAttribution`) |
| `Transaction.campaignItemId` without `campaignId` | Reject — an item without its campaign is meaningless |
| `@ApiProperty` with a made-up example | Reuse / add a constant in `dto-examples.ts` |
| Hard-coded IDs in tests | Use the example constants |
| `npm run build` without first running `prisma:generate` after schema edits | Type errors on `@prisma/client` imports |
| Swapping `@nestjs/swagger`'s `PickType` for `class-transformer`'s | Loses `@ApiProperty` metadata — always import from `@nestjs/swagger` |

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
- HTTP routes: REST, lowercased plural resource names (`/tenants`,
  `/transactions`), tenant-scoped as `/tenants/:tenantId/<sub>`.
- Global prefix `/api`, URI versioning default `v1` → final paths look
  like `/api/v1/tenants/:tenantId/transactions`.
- Bearer token: `Authorization: Bearer <Firebase ID token>`.

---

## 13. When you're about to edit — final checklist

Before you save changes:

1. Does the layer you're editing violate the dependency rules in §4?
2. Are you sharing a DTO across modules instead of extending a shared base?
3. Do new controllers/handlers have `@ApiOperation` + response decorator + role decorator?
4. Are new schema changes reflected in the shared DTO?
5. Did you add/update examples in `dto-examples.ts`?
6. Did you forget `deletedAt: null` on a read query?
7. Did you forget `tenantId` on a tenant-scoped query?
8. Did you run `npm run prisma:generate` after editing the schema?

If all eight are clean, the change is safe to commit.
 
 ---
 
 ## 14. Date Handling
 
 We exclusively use **dayjs** for all date manipulation, parsing, and arithmetic.
 
 - **Single Source of Truth:** Always import `dayjs` from `@shared/dayjs` to ensure plugins (UTC, etc.) are loaded.
 - **Prisma Compatibility:** When saving a date to a Prisma `DateTime` field, use `dayjs(val).toDate()`. Prisma expects native JS `Date` objects.
 - **No `new Date()`:** Do not use `new Date()` or `Date.now()`. Use `dayjs()` instead.
 - **UTC:** Prefer `dayjs.utc()` for calculations where timezone consistency is critical.

