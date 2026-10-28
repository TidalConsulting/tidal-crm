# Tidal OS — Plan

Stack decisions, folder structure, schema and phase task lists. Approved Oct 28, 2026.

## Status

| Phase | Status |
| --- | --- |
| 1. Foundation | **Built, awaiting review**: see "Phase 1 as built" below |
| 2. Core CRM | Not started; waits for phase 1 sign-off |
| 3, 3.5, 4 | Not started |

## Decisions (Oct 28)

1. Stack approved: Drizzle, Supabase Auth (Google SSO), BullMQ.
2. Build against a **local Postgres** for now. No hosted Supabase project yet. A new Google Sheet will be created and connected in phase 3.5.
3. Agency admins see every sub-account automatically. The read-only **agency viewer** role is added.
4. **No client portal** yet; `portal_users` isn't reserved.

## 1. Stack decisions

Where SPEC.md §4 gives two options, this plan picks one. Each pick can be changed before phase 1 starts.

| Choice | Pick | Why |
| --- | --- | --- |
| ORM | **Drizzle** | RLS policies, `SECURITY DEFINER` helpers and triggers are plain SQL. Drizzle keeps them in the same migration files as the tables, and it doesn't hide `set_config` / `set local role` the way Prisma's connection handling does. |
| Auth | **Supabase Auth** with Google SSO, limited to the Workspace domain | RLS can use `auth.uid()` directly, and Supabase Realtime (live inbox, Kanban, dashboards) applies the same policies. With Clerk we'd need a JWT bridge on top. |
| Jobs | **BullMQ on Redis**, in a separate `worker` process | SPEC §4 already plans a separate worker on Railway/Fly. Postgres `events` stays the source of truth. BullMQ only handles delivery, delays (wait nodes) and retries. |
| Monorepo | **pnpm workspaces**: `apps/web`, `packages/db`, `packages/core` (`apps/worker` joins in phase 4) | The web app and worker share the schema and the service layer. |
| Tests | **Vitest** against a real Postgres (local Supabase in Docker, or a plain Postgres 16 with an `auth` stub schema in CI) | You can't prove RLS with mocks. |
| Charts (dashboards) | **Recharts** + **react-grid-layout** | Works with shadcn/ui, and react-grid-layout covers the drag/resize grid. |

## 2. Folder structure

```
tidal-crm/
├─ SPEC.md, PLAN.md, CLAUDE.md (written after phase 1)
├─ docs/master-prompt.md
├─ apps/
│  ├─ web/                         Next.js App Router
│  │  ├─ app/
│  │  │  ├─ (auth)/login/
│  │  │  ├─ (app)/agency/          agency view: dashboard, sub-accounts, snapshots, team, settings
│  │  │  ├─ (app)/l/[locationId]/  sub-account view; every module lives under here
│  │  │  │  ├─ dashboard/  conversations/  calendars/  contacts/  opportunities/
│  │  │  │  ├─ automation/  sites/  marketing/  payments/  reporting/  settings/
│  │  │  └─ api/
│  │  │     ├─ v1/                 public REST API (API-key auth)
│  │  │     └─ webhooks/           twilio/[locationId], email, stripe, google
│  │  ├─ components/ (ui/ = shadcn, shell/ = sidebar, top bar, switcher)
│  │  └─ lib/ (supabase clients, session → tenant context)
│  └─ worker/                      BullMQ: event dispatcher, workflow runner, metric rollups, sheet sync
├─ packages/
│  ├─ db/                          Drizzle schema, SQL migrations (incl. RLS), seed, withTenant()
│  └─ core/                        service layer: one module per domain (contacts, pipelines…), audit + events
└─ tests/                          isolation, workflow, webhook tests (Vitest)
```

`/l/[locationId]/…` puts the active sub-account in every URL, so switching sub-accounts changes every view, deep links work, and two tabs can show two companies. The last-used location goes in `users.last_location_id`.

## 3. Tenant isolation design

- Each request runs inside `withTenant({ userId, locationId }, fn)`. This opens a transaction and runs `set local role app_user`, then `set_config('app.user_id', …, true)` and `set_config('app.location_id', …, true)`. Because `app_user` does not own the tables, RLS applies to it.
- Helper functions (`SECURITY DEFINER`, `STABLE`):
  - `app.current_user_id()` = `app.user_id` setting, falling back to `auth.uid()` so the same policies work for Supabase Realtime.
  - `app.can_access_location(loc uuid)`: true if the user has a membership on `loc`, or an agency membership on the agency that owns `loc`.
  - `app.location_role(loc uuid)` returns `agency_admin`, `location_admin` or `user`.
- Policy on every tenant table: `USING (location_id = current_setting('app.location_id')::uuid AND app.can_access_location(location_id))`, with the same check on `WITH CHECK`. Agency roll-ups skip the location pin and use `app.can_access_location(location_id)` only. They run as separate read-only queries.
- `deleted_at IS NULL` filtering lives in the service layer, not in RLS, so admins can still restore soft-deleted records.
- Service-role access (worker, webhooks) goes through `withSystem(locationId, fn)`, which still pins `app.location_id` and logs `actor = system:<job>` in the audit log.

## 4. Schema

Base columns on every tenant table: `id uuid pk default gen_random_uuid()`, `location_id uuid not null`, `created_at`, `updated_at` (trigger), `created_by uuid`, `deleted_at`. Each table gets an index on `(location_id, created_at)` plus whatever lookups it needs.

**Phase 1 tables** (full DDL in the first migration):

| Table | Columns beyond the base | Notes |
| --- | --- | --- |
| agencies | name, branding jsonb, settings jsonb | No location_id |
| locations | agency_id, name, slug, legal_name, timezone default 'America/New_York', phone_number, sending_domain, stripe_account_id, snapshot_id, archived_at | RLS: visible if `can_access_location(id)` |
| users | id = auth.users.id, email, name, avatar_url, last_location_id | No location_id |
| memberships | user_id, agency_id *or* location_id (check: exactly one), role, permissions jsonb | unique(user_id, location_id), unique(user_id, agency_id) |
| audit_log | actor_id, actor_type, action, entity, entity_id, before jsonb, after jsonb, ip | Append-only: no UPDATE/DELETE grant for app_user, 8-year retention |
| events | type, entity, entity_id, payload jsonb, processed_at, attempts | Index on `(processed_at) where processed_at is null`; the worker uses `LISTEN events_new` plus a poll as backup |
| contacts | first_name, last_name, email (citext), phone (E.164), company_id, owner_id, source, dnd_sms, dnd_email, lead_score, custom jsonb | Only the minimum the isolation test and seed need; phase 2 adds the rest. Partial unique on (location_id, email) and (location_id, phone) where deleted_at is null |
| pipelines, pipeline_stages | name; name, position, probability | The seed needs two per sub-account |
| dashboards, dashboard_widgets | per SPEC §5 | Table and RLS only in phase 1, so dashboards scope by tenant from day one. The UI comes in phase 2. |

Phase 1 also covers `snapshots` and `api_keys` as empty tables with RLS, so later phases don't need new policies.

**Later phases.** These add tables, nothing gets reworked: phase 2 adds companies, custom_field_defs, tags, smart_lists, opportunities, stage history, tasks and notes, plus metric_daily and the default dashboard. Phase 3 adds conversations, messages, snippets, calendars, appointments and forms. Phase 3.5 adds the projects and sheet-sync tables. Phase 4 adds workflows, campaigns, invoices and webhooks. Each new table follows the same base-column, RLS, audit and event pattern, enforced by the test in task 1.10.

## 5. Phase 1 task list

| # | Task | Done when |
| --- | --- | --- |
| 1.1 | Scaffold pnpm monorepo: Next.js 15 + TS strict, Tailwind, shadcn/ui, ESLint/Prettier, Vitest, `docker compose` (Postgres via Supabase CLI, Redis) | `pnpm dev` serves a page; `pnpm test` runs |
| 1.2 | `packages/db`: Drizzle config, base-column helper, first migration with the phase 1 tables above | `pnpm db:migrate` applies cleanly to an empty DB |
| 1.3 | RLS migration: `app_user` role, `app.*` helper functions, policies on every tenant table, audit_log made append-only | `select` as app_user with no settings returns 0 rows |
| 1.4 | `withTenant` / `withSystem`; in `packages/core`, a `mutate()` helper that writes the entity change, an audit_log row and an event row in one transaction | Unit test: one contact create → 1 audit row + 1 `contact.created` event |
| 1.5 | Supabase Auth with Google SSO (domain allowlist), session middleware, first-login user provisioning | Logging in creates a `users` row; the user lands on their last-used sub-account |
| 1.6 | App shell: left sidebar (SPEC §8 order, phase-gated items disabled), top bar with searchable sub-account switcher, user menu, light/dark | Switching updates the URL and every view; the choice persists across logins |
| 1.7 | Agency view: sub-account list, create (<1 min, name + timezone; snapshot picker stubbed until phase 4), edit, archive; team page to invite users and set memberships/roles | Agency admin creates a sub-account and adds a user to it |
| 1.8 | Settings shell: business profile (editable), with placeholder pages for users, custom fields, tags, pipelines, phone numbers, email domains, integrations, API keys, webhooks | All 11 settings routes render; business profile saves with an audit row |
| 1.9 | Seed: Tidal agency, 7 sub-accounts, two pipelines each (Sales, plus a company-specific one), 50 faker contacts each, test users (1 agency admin, 1 GovPointe user, 1 Gaia user) | `pnpm db:seed` is idempotent |
| 1.10 | Isolation tests: GovPointe user can't read, update, insert into or delete Gaia contacts (including by forging `location_id` and by setting `app.location_id` to Gaia); agency admin can read both; plus a schema test that fails if any table with `location_id` lacks RLS + policies | `pnpm test` is green in CI |
| 1.11 | GitHub Actions CI: lint, typecheck, migrate on a fresh DB, tests | Green on PR |
| 1.12 | Write `CLAUDE.md`: run commands, conventions, the tenant-isolation rule, "every mutation via `mutate()`" | Committed |

**Phase 1 acceptance (SPEC §9):** a user in GovPointe cannot see Gaia contacts (test 1.10 passes), and switching sub-accounts changes every view (1.6).

## 6. Dashboards (added Oct 28)

These are the build steps for the Dashboards module in SPEC §6:

- **Phase 1:** `dashboards` / `dashboard_widgets` tables and RLS, plus a "Dashboard" route stub in the shell.
- **Phase 2:** `metric_daily` rollup, filled by the worker on every event and rebuilt nightly. A default sub-account dashboard with fixed widgets (new leads, leads by source, pipeline value by stage, won revenue, win rate, tasks overdue) and a date-range picker with prior-period compare, plus drill-down to the filtered contact and opportunity lists.
- **Phase 3:** inbox, appointment and form widgets as those modules land.
- **Phase 4:** the full builder: widget library, react-grid-layout drag/resize, per-widget filters and visualization, private/shared dashboards, agency roll-up with per-sub-account breakdown, PDF/CSV export, weekly email digest, and dashboards included in snapshots.
- **Phase 3.5:** project and revenue-share widgets, plus the per-GC revenue-share dashboard.

Widget queries are a typed registry (`packages/core/metrics`). Each metric declares its source, the dimensions it supports and how to compute it from `metric_daily` (history) and live tables (today). The UI can only request registered metrics, so there is no ad-hoc SQL from the client.

## 7. Phase 1 as built

Acceptance (SPEC §9):

- **"A user in GovPointe cannot see Gaia contacts"**: `packages/core/tests/isolation.test.ts` runs as the non-owner `app_user` role, so it tests the Postgres policies directly. It covers: reading pinned, unpinned and forged-pin; reading by id; inserting with a forged `location_id`; updating; moving a row to another tenant; hard delete; seeing Gaia's location, pipelines, users, memberships and dashboards; self-granting access; self-promotion. Guardrail tests fail if any table lacks RLS or the standard tenant policies, or if `app_user` can DELETE anything.
- **"Switching sub-accounts changes every view"**: the tenant is in the URL (`/l/[locationId]/…`), and the switcher keeps you on the same module (`/l/A/contacts` → `/l/B/contacts`) and records `last_location_id`. Checked in a browser with Playwright.

Task list:

| # | Task | Result |
| --- | --- | --- |
| 1.1 | Monorepo scaffold | Done: pnpm workspaces, Next.js 16, Tailwind 4, TS strict, ESLint, Vitest. shadcn-style primitives are hand-written in `components/ui` (the shadcn CLI isn't needed for this set). |
| 1.2 | Drizzle schema + first migration | Done: `0000_init.sql` (13 tables) |
| 1.3 | RLS migration | Done: `0001_rls.sql`, with `app.location_ids()` / `app.agency_ids()` evaluated once per statement, `app.apply_tenant_policies()` for future tables, column-level update grants, no DELETE |
| 1.4 | `withTenant` / `withSystem` / `recordChange` | Done: every service mutation writes `audit_log` + `events` in one transaction. `audit_log` is append-only by trigger. `events` inserts fire `pg_notify('events_new')` for the phase 4 worker. |
| 1.5 | Auth | Done: `AUTH_MODE=dev` (signed cookie, seeded-user picker, refused in production) for local work. `AUTH_MODE=supabase` (Google SSO via `@supabase/ssr`, domain allowlist, invite→first-login re-keying) is wired but **untested until a Supabase project exists**. |
| 1.6 | App shell + switcher | Done: sidebar in SPEC §8 order with phase badges, searchable keyboard-friendly switcher, light/dark/system theme, mobile module bar |
| 1.7 | Agency view | Done: roll-up dashboard, sub-account list/create/edit/archive (create makes a Sales pipeline + default dashboard), team page (grant/change/remove access by email) |
| 1.8 | Settings shell | Done: all 11 SPEC settings routes. Business profile (admin-editable) and Users (sub-account admins manage their members) are live; the rest are phase placeholders. |
| 1.9 | Seed | Done and idempotent: Tidal agency, 7 sub-accounts, Sales + company-specific pipeline each, 50 contacts each, default dashboards, 6 test users covering every role |
| 1.10 | Isolation tests | Done: 40 tests, stable under shuffled order |
| 1.11 | CI | Done: `.github/workflows/ci.yml` (Postgres 16 service, lint, typecheck, test, build) |
| 1.12 | CLAUDE.md | Done |

Beyond the plan:

- Read-only **Contacts** list (server-side search + pagination) and a phase 1 **Dashboard** (contacts, 30-day leads, leads by source, pipelines). Both are read-only, so isolation is visible in the UI. Editing, import and the widget dashboard are phase 2.
- `agency_viewer` role (decision 3).

Deferred, by design:

- `apps/worker` and Redis: nothing consumes events until the workflow engine (phase 4). Events already queue up in `events` with `processed_at IS NULL`.
- Snapshot picker on "New sub-account" is shown disabled until phase 4.
- Global search, quick-add and notifications are shown disabled until phases 2–3.

Known limits to revisit:

- A sub-account admin can set `archived_at` on their own sub-account at the DB level. The UI only offers archive to agency admins.
- `cacheComponents` (Next 16) is off on purpose. Every page is per-user, so caching gains little and risks serving one tenant's data to another.
