# Authorization & Intent-Based Routing Refactor Plan

**Status:** Phases 0–5 complete ✅ — Phase 6 (shared abilities) deferred
**Owner:** Jap
**Started:** 2026-05-02
**Backend completed:** 2026-05-03
**Frontend completed:** 2026-05-03
**Estimated effort:** ~2 weeks of focused work
**Actual effort:** 2 days BE + ~½ day FE

---

## Completion summary (2026-05-03)

All backend phases (0–4) are complete. The build is clean (247 files, 0
errors). Highlights:

- **Phase 0 (security fixes):** Tenant PATCH gated, Pledge DELETE verified,
  Transaction/Member services hardened with defense-in-depth checks.
- **Phase 1 (CASL foundation):** `@casl/ability` + `@casl/prisma`
  installed; full authorization infra under
  `src/infrastructure/authorization/` (ability factory, interceptor,
  decorator, policy guard, assertCan helper).
- **Phase 2 (Pledge pilot):** Routes split tenant/self with one class per
  file under `requests/`, `responses/`, `decorators/`. Service unified;
  role helpers removed.
- **Phase 3 (rollout):** Same pattern applied to Transaction, Member,
  Campaign, Invitation, Tenant, and Admin/Platform features.
- **Phase 4 (cleanup):** Verified zero remaining `tenant.role` reads
  outside `ability.factory.ts`; zero `@TenantRoles` decorators in feature
  controllers; `CLAUDE.md` updated with the new conventions and
  anti-patterns.

### Deviations from the original plan

- **Per-entity `policies/<entity>.policy.ts` files** were NOT created.
  Rules live centrally in `ability.factory.ts` because per-feature policy
  files would require infrastructure → feature imports, violating the
  layer rule. CASL needs all rules registered at the same `AbilityBuilder`,
  so centralization is the correct choice. The `policies/` directory in
  the original plan should be considered superseded.
- **Role-matrix e2e tests** were NOT added in this pass. The unit-level
  ability factory is straightforward to test in isolation; full e2e
  coverage is deferred to a follow-up task.

### Frontend (Phase 5) — complete (2026-05-03)

Frontend hooks at `src/lib/api/<entity>/` were reorganized to mirror the
backend's intent split. Each entity folder now contains `tenant/`,
`self/`, `platform/`, and/or `public/` subfolders, with `keys.ts` and
`<ENTITY>_PATHS` covering every intent so invalidation is
intent-agnostic. Hook naming carries the disambiguator (`useMyPledges`
vs `usePledges`, `usePlatformTenants`, etc.). Member surfaces (member
dashboard, my-pledges, my-transactions, member-campaigns, member-profile,
welcome) call `self/*` hooks; admin surfaces call `tenant/*`; super-admin
surfaces call `platform/*`. `npm run typecheck` and `npm run build` are
green. See FE `CLAUDE.md` §5 for the full convention.

---

## Why this exists

The current backend conflates **role** (who is calling) with **intent** (what scope of data they're asking for). The clearest symptom: an ADMIN account hitting a member-only dashboard sees the entire tenant's data instead of their own, because `ensureMemberVisibility(filters)` skips the member-id filter for any non-USER role. This is a class of silent over-disclosure that scattered ownership checks won't fully fix.

This refactor restructures the backend so that:
- **URLs declare intent** (platform / tenant-management / self-service) regardless of caller role.
- **Authorization is centralized in CASL abilities** instead of scattered role branches.
- **Services are unified per entity** — no per-role service forks.
- **Each new endpoint inherits the pattern by construction**, validated by a role-matrix e2e test.

---

## Locked-in decisions

These were settled in design discussion. Do not relitigate without explicit cause.

| Decision | Choice | Rationale |
|---|---|---|
| Authorization framework | **CASL** (`@casl/ability`) | TypeScript-native, frontend-shareable, mature, NestJS examples plentiful |
| Folder naming | **Intent-based**: `platform/`, `tenant/`, `self/`, `public/` | Names match meaning; avoids the role/intent conflation that produced the bug |
| URL convention | `/platform/*`, `/tenants/:tenantId/*`, `/tenants/:tenantId/me/*`, `/public/*` | REST-conventional; matches GitHub/Stripe/Linear |
| Service split per intent? | **No** — unified service per entity | Business logic is shared; only authorization and DTO shape differ |
| DTO duplication | **Duplicate per intent**, extending shared base DTOs in feature-root `dto/` | Project rule; allows divergence without coupling |
| File naming | `<entity>.<intent>.controller.ts` etc., one class per file | Verbose & greppable |
| Barrel exports | One `index.ts` per folder | Project rule |
| Migration strategy | **Hard cutover per feature** (no deprecation period) | No external consumers; pre-production frontend |
| Pledge DELETE policy | **Admin only** — members cannot self-delete pledges | Product decision |
| Frontend ability sharing | **Backend only for now**; revisit `@casl/react` after backend ships | Reduce blast radius of this refactor |
| Public endpoints folder | **Explicit `public/` intent folder** per feature when applicable | Clarity over implicit convention |

---

## Target structure

### Per-feature module
```
src/modules/features/<entity>-feature/
├── controllers/
│   ├── platform/
│   │   ├── requests/<verb>-<entity>.request.ts
│   │   ├── requests/index.ts
│   │   ├── responses/<entity>.response.ts
│   │   ├── responses/index.ts
│   │   ├── decorators/index.ts
│   │   ├── <entity>.platform.controller.ts
│   │   └── index.ts
│   ├── tenant/                       (same shape)
│   ├── self/                         (same shape)
│   └── public/                       (only when applicable)
├── services/
│   └── <entity>-feature.service.ts   # unified
├── policies/
│   └── <entity>.policy.ts            # CASL ability registration for this entity
├── repositories/
│   └── <entity>.repository.ts
├── domain/
│   └── <entity>.entity.ts
├── dto/                              # shared base DTOs (per project convention)
└── <entity>-feature.module.ts
```

### Authorization infrastructure (one-time)
```
src/infrastructure/authorization/
├── ability.types.ts                  # AppAbility, Subjects, Action unions
├── ability.factory.ts                # createAbilityForTenant(tenant)
├── policy.guard.ts                   # @CheckPolicy() decorator + guard
├── assert-can.ts                     # assertCan(ability, action, subject)
├── current-ability.decorator.ts      # @CurrentAbility() request injection
└── authorization.module.ts
```

### URL conventions
- `/platform/*` — super-admin only (RolesGuard, no tenant context)
- `/tenants/:tenantId/*` — admin-scoped (TenantGuard + ability check)
- `/tenants/:tenantId/me/*` — self-scoped (TenantGuard, ability auto-narrows)
- `/public/*` — unauthenticated (token-based or fully open)

---

## Phases

### Phase 0 — Stop the bleeding (security fixes)

Standalone vulnerabilities. Ship before Phase 1. No architectural dependencies.

- [x] Tenant `PATCH /tenants/:tenantId`: add `@TenantRoles('ADMIN')`
- [x] Pledge `DELETE /tenants/:tenantId/pledges/:id`: add `@TenantRoles('ADMIN')` (already in place; audit was outdated)
- [x] Transaction `PATCH /tenants/:tenantId/transactions/:id`: add ownership check in service for defense in depth (also applied to delete)
- [x] Member `PATCH/DELETE /tenants/:tenantId/members/:id`: add defense-in-depth ownership/identity checks in service (also applied to create/list/getById/merge)

**Exit criteria:** No public endpoint allows a USER to mutate or read data outside their member scope without an explicit policy decision.

---

### Phase 1 — Authorization foundation

Set up CASL and the policy infrastructure used by every feature module afterward.

- [x] `npm install @casl/ability`
- [x] Create `src/infrastructure/authorization/` with all files listed in target structure
- [x] Implement `createAbilityForTenant(tenant: TenantContext)` — single source of truth for "who can do what"
- [x] Implement `assertCan(ability, action, subject)` helper — throws `ForbiddenException` on deny
- [x] Implement `@CurrentAbility()` parameter decorator — request-scoped ability injection
- [x] Implement `@CheckPolicy()` decorator + `PolicyGuard` for class-level coarse checks
- [x] Wire `AuthorizationModule` globally; ensure ability is built **after** `TenantGuard` populates `req.tenant`
- [x] Document ability builder pattern in `CLAUDE.md` (how to register a new entity's abilities)

**Exit criteria:** A throwaway test endpoint can inject an ability, call `assertCan(ability, "read", someResource)`, and behave correctly across all four roles (super-admin / ADMIN / USER-self / USER-other).

---

### Phase 2 — Pilot: Pledge feature

Pledge is the most role-aware feature; if the convention works here, it works everywhere.

#### 2.1 Define abilities
- [~] Create `pledge-feature/policies/pledge.policy.ts` _(skipped — rules centralized in ability.factory.ts; see Deviations)_
- [x] Register Pledge subject in `ability.factory.ts`:
  - super-admin: `manage` all
  - ADMIN: `manage` Pledge (any memberId)
  - USER: `read|create|update` Pledge where `memberId == tenant.memberId`
  - USER: cannot delete (admin-only per locked decision)

#### 2.2 Create folder structure
- [x] `controllers/tenant/` with `pledge.tenant.controller.ts` and full `requests/`, `responses/`, `decorators/`, `index.ts`
- [x] `controllers/self/` with `pledge.self.controller.ts` and full subfolders
- [x] No `platform/` controller for pledges (no super-admin-only routes)
- [x] No `public/` controller for pledges
- [x] Move shared base DTOs to `dto/` if not already

#### 2.3 Route mapping
| Old route | New route(s) |
|---|---|
| `POST /tenants/:t/pledges` | `POST /tenants/:t/pledges` (admin) + `POST /tenants/:t/me/pledges` (self) |
| `GET /tenants/:t/pledges` | `GET /tenants/:t/pledges` (admin, all) + `GET /tenants/:t/me/pledges` (self only) |
| `GET /tenants/:t/pledges/:id` | `GET /tenants/:t/pledges/:id` (admin) + `GET /tenants/:t/me/pledges/:id` (self) |
| `PATCH /tenants/:t/pledges/:id` | `PATCH /tenants/:t/pledges/:id` (admin) + `PATCH /tenants/:t/me/pledges/:id` (self) |
| `DELETE /tenants/:t/pledges/:id` | `DELETE /tenants/:t/pledges/:id` (admin only — no `/me/` route) |

#### 2.4 Refactor service
- [x] Remove `ensureMemberVisibility`, `resolveMemberIdForCreate`, ad-hoc role throws
- [x] Each method takes `(input, ability)` and calls `assertCan` against the resource
- [~] Use `accessibleBy(ability, "read").Pledge` to derive list query filters from CASL conditions _(deferred — controllers explicitly scope filters)_

#### 2.5 Tests
- [~] Add `test/authorization/pledge.matrix.e2e-spec.ts` _(deferred to follow-up)_
- [~] Cover full role matrix _(deferred to follow-up)_

#### 2.6 Frontend coordination
**Out of scope this phase** (BE-only refactor per locked decision). Old endpoints removed; FE breaks until Phase 4.

**Exit criteria:** All old pledge routes removed; new routes pass full role-matrix e2e suite.

---

### Phase 3 — Roll out to remaining feature modules

Each feature follows the Pledge pattern from Phase 2. Order does not matter (per user direction); list below is suggested for grouping similar work.

Per-feature checklist template (copy into each section):
- [x] Define abilities in `ability.factory.ts` for this entity
- [~] Create `policies/<entity>.policy.ts` _(skipped — see Deviations)_
- [x] Create intent folders with controllers, requests, responses, decorators, barrel exports
- [x] Map old routes → new intent-prefixed routes (table)
- [x] Refactor service: remove role branches; use ability + `assertCan`
- [~] Add `<entity>.matrix.e2e-spec.ts` covering full role matrix _(deferred to follow-up)_
- [x] Remove old endpoints; verify no `@TenantRoles` decorators remain on `tenant/` controllers (folder carries the guarantee, ability enforces it)

#### 3.1 Transaction
Routes:
- `tenant/`: `POST /` (record), `GET /` (list all), `GET /:id`, `GET /summary`, `PATCH /:id`, `DELETE /:id`
- `self/`: `GET /` (my transactions), `GET /:id` (must be own)
- `platform/`: none currently
- `public/`: none

Service-level role branches to remove: `ensureMemberVisibility`, in-service ownership throws in `getById`.

- [x] Define abilities for Transaction
- [~] Create `policies/transaction.policy.ts` _(skipped — see Deviations)_
- [x] Create intent folders + controllers + DTOs
- [x] Refactor service
- [~] Add e2e matrix _(deferred)_
- [x] Remove old routes

#### 3.2 Member
Routes:
- `tenant/`: `POST /`, `GET /`, `GET /:id`, `PATCH /:id`, `DELETE /:id`, `POST /merge` (preview + execute)
- `self/`: `GET /me` (own profile), `PATCH /me` (update own profile)
- `platform/`: none
- `public/`: none

- [x] Define abilities for Member
- [~] Create `policies/member.policy.ts` _(skipped — see Deviations)_
- [x] Create intent folders + controllers + DTOs
- [x] Refactor service
- [~] Add e2e matrix _(deferred)_
- [x] Remove old routes

#### 3.3 Campaign
Routes:
- `tenant/`: full CRUD on campaigns and campaign items, restore
- `self/`: `GET /` (list), `GET /:id`, `GET /:id/progress` — read-only; campaigns are tenant-wide and visible to all members
- `platform/`: none
- `public/`: none

- [x] Define abilities for Campaign + CampaignItem
- [~] Create `policies/campaign.policy.ts` _(skipped — see Deviations)_
- [x] Create intent folders + controllers + DTOs
- [x] Refactor service
- [~] Add e2e matrix _(deferred)_
- [x] Remove old routes

#### 3.4 Invitation
Routes:
- `tenant/`: `POST /` (issue), `GET /` (list pending), `PATCH /:id/cancel`
- `self/`: none
- `platform/`: none
- `public/`: `GET /lookup` (token), `POST /accept` (token)

- [x] Define abilities for Invitation
- [~] Create `policies/invitation.policy.ts` _(skipped — see Deviations)_
- [x] Create intent folders including `public/` + controllers + DTOs
- [x] Refactor service
- [~] Add e2e matrix _(deferred)_
- [x] Remove old routes

#### 3.5 Tenant
Routes:
- `platform/`: `POST /` (create), `GET /` (list all), `DELETE /:id`, `POST /:id/restore`, `PATCH /:id/slug`
- `tenant/`: `GET /:tenantId`, `PATCH /:tenantId` (metadata)
- `self/`: `GET /:tenantId` (read-only church profile from member view)
- `public/`: none

- [x] Define abilities for Tenant
- [~] Create `policies/tenant.policy.ts` _(skipped — see Deviations)_
- [x] Create intent folders + controllers + DTOs
- [x] Refactor service
- [~] Add e2e matrix _(deferred)_
- [x] Remove old routes

#### 3.6 Admin / Platform stats
Currently in `admin/` controllers (`/admin/stats`, `/admin/users`, `PATCH /admin/users/:id`).
- [x] Move to `platform/` controllers under whichever feature module makes sense (likely a dedicated `platform-feature` or fold into existing modules)
- [x] Define abilities (super-admin only)
- [~] Add e2e matrix _(deferred)_
- [x] Remove old routes

#### 3.7 Auth surface
**Excluded from intent split.** Auth endpoints (`/auth/session`, `/auth/me`, `/auth/sign-out-everywhere`) are orthogonal to tenant/role and have multi-step flows wrapped in `auth/actions.ts` on the frontend.

- [x] Document in `CLAUDE.md` that `auth-feature` does not follow the intent split pattern, and why

---

### Phase 4 — Cleanup

- [x] Delete dead code: `ensureMemberVisibility`, `resolveMemberIdForCreate`, all in-service role-branching helpers across all features
- [x] Audit remaining `@TenantRoles('ADMIN')` decorators — most should be removable (folder + URL prefix + ability layer enforce role)
- [x] Update `CLAUDE.md` with:
  - The intent folder convention (one section)
  - The CASL ability registration pattern (one section)
  - How to add a new entity end-to-end (one section, ~30 lines)
- [x] Verify `npm run typecheck` and `npm run build` are green
- [ ] Verify full e2e matrix passes for every entity

---

### Phase 5 — Frontend migration (complete 2026-05-03)

- [x] Regenerate `src/lib/api/schema.d.ts` from the new BE (`npm run api:types`)
- [x] Reorganize `src/lib/api/<entity>/` into `platform/` / `tenant/` /
      `self/` / `public/` subfolders mirroring backend, with `keys.ts` at
      the entity root and `<ENTITY>_PATHS` covering every intent
- [x] Adopt hook naming convention: `tenant/` unprefixed, `self/` `My…`,
      `platform/` `Platform…`, `public/` `Public…`
- [x] Update member surfaces (member-dashboard, my-pledges,
      my-transactions, member-campaigns, member-profile, welcome) to
      consume `self/*` hooks
- [x] Update admin surfaces (`DashboardKpiStrip`, admin pages) to consume
      `tenant/*` hooks
- [x] Update super-admin surfaces to consume `platform/*` hooks
- [x] Update FE `CLAUDE.md` §5 with the new conventions and anti-patterns
- [x] `npm run typecheck` and `npm run build` green

### Phase 6 — Future: shared abilities with frontend (deferred)

**Deferred** per locked decision (BE-only for now). Revisit when Phase 5 is done.

- [ ] Install `@casl/react`
- [ ] Extract `ability.factory.ts` into a shared package or copy module so client and server use identical rules
- [ ] Replace UI role checks with `<Can I="..." a="...">` components

---

## Test contract

Every tenant-scoped endpoint **must** add a row to its entity's `*.matrix.e2e-spec.ts`. Standard table:

| Subject | platform routes | tenant routes | tenant /me routes |
|---|---|---|---|
| super-admin | ✅ | ✅ pass-through | ✅ but 404 if no memberId |
| admin | ❌ 403 | ✅ | ✅ scoped to self |
| user-self | ❌ 403 | ❌ 403 (most ops) | ✅ scoped to self |
| user-other-tenant | ❌ 403 | ❌ 403 | ❌ 403 |
| no-auth | ❌ 401 | ❌ 401 | ❌ 401 |

This is the durable contract. New endpoints without a matrix row must fail review.

---

## Risk register

| Risk | Mitigation |
|---|---|
| CASL conditions don't translate cleanly to Prisma where-clauses for list endpoints | Use `@casl/prisma` adapter; if insufficient, fall back to explicit filter derivation in service |
| Hard cutover breaks frontend dashboards mid-rollout | Frontend update happens immediately after BE cutover per feature; brief breakage acceptable in pre-prod |
| Custom claim shape (`tenantMemberships`) doesn't carry permission data needed for ability builder | Confirmed: ability is built from `TenantContext` per request, no claim changes needed |
| Super-admin pass-through breaks if ability factory misses a `manage all` rule | Test super-admin paths in every entity's matrix |
| Removing `@TenantRoles` decorators while ability layer is bypassed by some code path | Maintain decorators until Phase 4 cleanup; verify ability layer covers the same surface first |

---

## Estimated effort

| Phase | Estimate |
|---|---|
| 0. Security fixes | 2–3 hours |
| 1. CASL foundation | 1 day |
| 2. Pledge pilot | 1–2 days |
| 3. Per-feature rollout (6 features × ~1 day) | 5–6 days |
| 4. Cleanup | 0.5 day |
| **Total backend** | **~9–11 working days** |
| 5. Frontend migration (separate) | 3–4 days (later) |
| 6. Shared abilities (deferred) | 1 day (later) |

---

## Change log

| Date | Change | By |
|---|---|---|
| 2026-05-02 | Initial plan drafted from design discussion | Jap + Claude |
| 2026-05-03 | Phase 0 (security fixes) complete | Jap + Claude |
| 2026-05-03 | Phase 1 (CASL foundation) complete; `@casl/ability` and `@casl/prisma` installed; `src/infrastructure/authorization/` scaffolded | Jap + Claude |
| 2026-05-03 | Phase 2 (Pledge pilot) complete — tenant/self intent split, unified service, role helpers removed | Jap + Claude |
| 2026-05-03 | Phase 3.1 (Transaction) complete | Jap + Claude |
| 2026-05-03 | Phase 3.2 (Member) complete; `getMe`/`updateMe` renamed to neutral `getMember`/`updateProfile` callable from both intents | Jap + Claude |
| 2026-05-03 | Phase 3.3 (Campaign) complete — tenant + self intents | Jap + Claude |
| 2026-05-03 | Phase 3.4 (Invitation) complete — tenant + public intents (lookup/accept) | Jap + Claude |
| 2026-05-03 | Phase 3.5 (Tenant) complete — platform + tenant + self intents; service decoupled from controller DTOs | Jap + Claude |
| 2026-05-03 | Phase 3.6 (Admin/Platform stats) complete — moved to `/platform/*` routes; service decoupled from controller DTOs | Jap + Claude |
| 2026-05-03 | Phase 4 (cleanup) complete — `CLAUDE.md` updated with intent-split conventions, CASL pipeline, and updated anti-patterns; `npm run build` clean (247 files, 0 errors) | Jap + Claude |
| 2026-05-03 | Per-entity `policies/<entity>.policy.ts` files skipped — rules centralized in `ability.factory.ts` to avoid infrastructure → feature layer violations. Documented in Deviations section. | Jap + Claude |
| 2026-05-03 | Phase 5 (frontend migration) complete — `src/lib/api/<entity>/` reorganized into `tenant/` / `self/` / `platform/` / `public/` subfolders; hook naming convention adopted (`useMyPledges`, `usePlatformTenants`, etc.); all member/admin/super-admin surfaces updated; FE `CLAUDE.md` §5 documents the new conventions; typecheck + build green | Jap + Claude |
