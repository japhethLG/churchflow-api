# Church App Backend

Multi-tenant church management API. Tracks incoming financial transactions
(tithes, offerings, mission giving, first fruit, commitments, donations) and
lets churches run pledge-based fundraising campaigns (building funds, mission
trips) broken into line items members can commit to individually.

## Stack

- **NestJS 11** — framework
- **Prisma 7 + PostgreSQL** — database (multi-file schema + `@prisma/adapter-pg`)
- **Firebase Admin** — authentication only (Google SSO from the client,
  ID token verification on the server). No other Firebase services.

## Architecture

Adapted from the Griffin 5-tier architecture — dependencies only flow downward,
never sideways within a layer.

```
Main       → Feature, Process, Core, Infra
Feature    → Process, Core, Infra
Process    → Core, Infra
Core       → Infra                  (never other Core)
Infra      → (external adapters only)
```

Each module contains a subset of `controllers/`, `services/`, `repository/`,
`dto/` (feature only) and `*.types.ts` (core only):

| Layer       | Controllers | Services | Repositories | Request/Response DTOs | Internal `*.types.ts` |
|-------------|-------------|----------|--------------|-----------------------|-----------------------|
| Feature     | ✅          | ✅       | ❌           | ✅                    | ❌                    |
| Process     | ❌          | ✅       | ❌           | ❌                    | ❌ (use feature DTOs or inline input interfaces) |
| Core        | ❌          | ✅       | ✅           | ❌                    | ✅                    |
| Infrastructure | ❌       | ✅       | ❌           | ❌                    | ❌                    |

> We intentionally skip port/interface files and domain model files from the
> Griffin variant — services and repositories are referenced by their concrete
> class directly.

### Directory layout

```
prisma/
└── schema/                 # Prisma 7 multi-file schema (auto-merged)
    ├── schema.prisma       # generator + datasource
    ├── user.prisma
    ├── tenant.prisma
    ├── member.prisma       # Member + MemberRole + MemberStatus
    ├── campaign.prisma     # Campaign + CampaignItem + CampaignStatus
    ├── pledge.prisma       # Pledge + PledgeStatus
    ├── transaction.prisma  # Transaction + TransactionType + PaymentMethod
    └── invitation.prisma   # Invitation + InvitationStatus

src/
├── main.ts                 # bootstrap
├── main.module.ts          # root module — wires every layer
├── main.controller.ts      # /health
├── infrastructure/
│   ├── config/interceptors/
│   ├── prisma-client/      # Prisma client service + module
│   └── firebase-auth/      # Firebase Admin, guards, decorators
├── shared/                 # cross-module building blocks
│   ├── dto-examples.ts     # @ApiProperty example constants (single source)
│   └── dto/                # one response DTO per Prisma entity + helpers
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
└── modules/
    ├── core/               # single-entity CRUD
    │   ├── user/           # services/, repository/, user.types.ts
    │   ├── tenant/
    │   ├── member/
    │   ├── campaign/
    │   ├── campaign-item/
    │   ├── pledge/
    │   ├── transaction/
    │   └── invitation/
    ├── processes/          # reusable multi-step operations
    │   └── invitation-processing/
    └── features/           # HTTP-facing workflows
        ├── auth-feature/   # controllers/, services/, dto/
        ├── tenant-feature/
        ├── campaign-feature/
        ├── pledge-feature/
        ├── transaction-feature/
        └── invitation-feature/
```

### Domain model — campaigns, items, pledges, transactions

```
Campaign (building fund, mission trip, etc.)
│  - no stored goal — the goal is the sum of its items' targetAmount
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
      - pledgeId optional — when set, campaignId/campaignItemId must match
      - campaignItemId optional — must belong to campaignId when set
      - campaignId optional
```

Rule: when recording a `Transaction`, if `pledgeId` is given it fully
determines `campaignId` and `campaignItemId` (the transaction feature service
copies them and rejects caller-supplied mismatches). If only
`campaignItemId` is set, it must belong to `campaignId`. Both are optional
— transactions can exist without any campaign attribution.

### Prisma multi-file schema

The schema lives in [prisma/schema/](prisma/schema/) — one file per
entity/domain group. Prisma 7 merges every `*.prisma` in that folder into a
single schema at generate/migrate time. Cross-file references (e.g. `Tenant`
referencing `Member`) just work — no imports needed. The folder is wired via
[prisma.config.ts](prisma.config.ts): `defineConfig({ schema: 'prisma/schema' })`.

## Setup

```bash
# 1. Install deps
npm install

# 2. Copy env and fill in DATABASE_URL + Firebase service account
cp .env.example .env

# 3. Generate Prisma client
npm run prisma:generate

# 4. Run migrations
npm run prisma:migrate

# 5. Start the server
npm run start:dev
```

API runs on `http://localhost:8000/api/v1/`.

## API docs

OpenAPI docs are generated from the NestJS controllers at runtime and served
by [@scalar/nestjs-api-reference](https://github.com/scalar/scalar). Setup
lives in [src/swagger.config.ts](src/swagger.config.ts).

| Endpoint | Purpose |
|---|---|
| `http://localhost:8000/api-docs` | Interactive Scalar API reference (browse, try requests) |
| `http://localhost:8000/api-docs-json` | Raw OpenAPI 3.x JSON — import into Postman/Insomnia, or feed to codegen |

> These paths are **not** under the `/api` global prefix. Docs are always
> served from the root so they're easy to find.

### Authenticating in the docs

All non-`@Public()` routes require a Firebase ID token. In the Scalar UI:

1. Click **Authentication** (top right).
2. Choose the `Bearer` scheme.
3. Paste a Firebase ID token (get one from your web/mobile client after
   `signInWithPopup`, or from a test script using the Firebase client SDK).
4. Requests will now send `Authorization: Bearer <token>` automatically.

The token is persisted in your browser, so you won't need to re-enter it on
reload. It expires after ~1 hour — grab a fresh one if requests start
returning 401.

### Tagging controllers

Controllers should be tagged with `@ApiTags('...')` so they group neatly in
the docs (e.g. `auth`, `tenants`, `transactions`, `invitations`). DTOs are
reflected automatically from `class-validator` decorators.

## DTO conventions

Because the OpenAPI spec is the contract with the frontend (types are
generated from `/api-docs-json`), every request and response DTO needs proper
Swagger decorators. The rules below keep DTOs **unshared across modules** —
each feature owns its controller-level DTOs and extends a shared base rather
than importing another feature's DTO.

### The three DTO tiers

| Tier | Location | Purpose | Decorators | Use `class-validator`? |
|------|----------|---------|------------|------------------------|
| **Shared base** | `src/shared/dto/<entity>.dto.ts` | One response DTO per Prisma entity — single source of truth for the entity's public shape | `@Expose()` + `@ApiProperty()` | ❌ (response-only) |
| **Feature request** | `src/modules/features/<x>/dto/*.request.dto.ts` | Input shape for a specific endpoint | `@ApiProperty()` + `@Is*()` validators | ✅ |
| **Feature response** | `src/modules/features/<x>/dto/*.response.dto.ts` | Output shape for a specific endpoint | Usually `extends SharedDto` via `PickType` / `OmitType`, plus any extra fields | ❌ |

The core layer uses plain TypeScript interfaces (`*.types.ts`) as internal
service contracts — **not** classes. This keeps `class-validator` out of
internal boundaries and prevents features from reaching into another
feature's DTOs.

### Shared base DTOs

One file per Prisma model in [src/shared/dto/](src/shared/dto/). Every field
is annotated with `@Expose()` (so `class-transformer` emits it) and
`@ApiProperty({ example })` (so OpenAPI schemas are accurate). Example
constants live in [src/shared/dto-examples.ts](src/shared/dto-examples.ts) so
examples stay consistent across the surface area.

```ts
// src/shared/dto/tenant.dto.ts
export class TenantDto {
  @Expose()
  @ApiProperty({ example: ID_EXAMPLE })
  id!: string;

  @Expose()
  @ApiProperty({ example: CHURCH_NAME_EXAMPLE })
  name!: string;

  // ... every column on the Prisma model ...
}
```

### Feature request DTOs

Per-endpoint input. Both `@ApiProperty()` (for OpenAPI) and class-validator
decorators (for the global `ValidationPipe`). Use `PartialType` to derive
updates from creates:

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

### Feature response DTOs

Extend the shared base to pick just the fields this endpoint returns. `PickType`,
`OmitType`, and `IntersectionType` from `@nestjs/swagger` all **preserve
Swagger metadata**:

```ts
// src/modules/features/tenant-feature/dto/tenant.response.dto.ts
export class TenantResponseDto extends TenantDto {}

// Or pick a subset:
export class TenantSummaryResponseDto extends PickType(TenantDto, ['id', 'name', 'logoUrl'] as const) {}

// List responses wrap the entity DTO with a meta block:
export class TenantListResponseDto {
  @Expose()
  @Type(() => TenantResponseDto)
  @ApiProperty({ type: [TenantResponseDto] })
  items!: TenantResponseDto[];

  @Expose()
  @Type(() => MetaDto)
  @ApiProperty({ type: MetaDto })
  meta!: MetaDto;
}
```

### Controller decorators

Every handler should declare its response type so the OpenAPI schema is
complete:

```ts
@ApiTags('tenants')
@ApiBearerAuth('Bearer')
@Controller('tenants')
export class TenantController {
  @Post()
  @ApiOperation({ summary: 'Create a new church' })
  @ApiCreatedResponse({ type: TenantResponseDto })
  async create(@Body() body: CreateTenantRequestDto): Promise<TenantResponseDto> { /* ... */ }
}
```

Decorator cheat sheet:

| Decorator | When to use |
|-----------|-------------|
| `@ApiTags('...')` | Group routes in Swagger/Scalar |
| `@ApiBearerAuth('Bearer')` | Mark that the route needs the bearer token |
| `@ApiOperation({ summary, description })` | Describe the endpoint's purpose |
| `@ApiParam({ name })` | Annotate a path param (`:id`) |
| `@ApiBody({ type })` | Explicit request-body type (usually inferred from the `@Body()` DTO) |
| `@ApiOkResponse({ type })` | `200` response schema |
| `@ApiCreatedResponse({ type })` | `201` response schema |
| `@ApiNoContentResponse()` | `204` — no body |

### Why this split

- **No module imports another module's DTOs.** Features extend *shared*
  base DTOs, never each other's.
- **One source of truth per entity.** If a Prisma column is added/renamed,
  only the shared DTO needs updating — every feature response inherits via
  `PickType` / extension.
- **Clean internal boundary.** Core service/repo take plain TS interfaces
  (`*.types.ts`) — no `class-validator` noise in the database layer, no
  feature-layer concerns leaking downward.
- **Accurate OpenAPI.** Because shapes are described with `@ApiProperty`
  everywhere (including examples), `/api-docs-json` is suitable for
  frontend codegen (`openapi-typescript`, `orval`, etc.).

## Build

Uses **SWC** via `nest-cli` (`"builder": "swc"`, `typeCheck: true`) — see
[.swcrc](.swcrc) and [nest-cli.json](nest-cli.json). Build scripts pass
`-b swc` explicitly so they're robust if `nest-cli.json` is changed.

## Authentication

`FirebaseAuthGuard` is registered globally via `APP_GUARD`. Every route
requires a Firebase ID token in `Authorization: Bearer <idToken>` unless
decorated with `@Public()`.

- `@Public()` — disable auth on a handler
- `@Roles('ADMIN' | 'USER' | 'SUPER_ADMIN')` — require role from custom claims
- `@CurrentUser()` — inject the decoded token as `AuthUser`

Custom claims are set by `POST /api/v1/auth/switch-tenant` after the user
selects which church to operate in. The frontend must force-refresh the ID
token after that call so subsequent requests carry the new claims.

## Adding a new module

**Core module** (new entity):
1. Add a new `<entity>.prisma` file (or extend an existing one) under [prisma/schema/](prisma/schema/), run `npm run prisma:migrate`
2. Create `modules/core/<name>/{dto,repository,services,<name>.module.ts}`
3. Export the service; import the module where needed

**Feature module** (new HTTP workflow):
1. Create `modules/features/<name>-feature/{controllers,services,dto,<name>-feature.module.ts}`
2. Import the core/process modules it depends on (never another feature)
3. Register in `main.module.ts`

**Process module** (reusable operation):
1. Create `modules/processes/<name>-processing/{services,<name>-processing.module.ts}`
2. Never include a controller; never import a feature
3. Export the service so features can import it
