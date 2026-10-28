# CLAUDE.md

Tidal OS: internal multi-tenant CRM (GoHighLevel-style). Read **SPEC.md** before changing behavior. **PLAN.md** tracks phase status. Build one phase at a time, and stop for review at the end of each phase.

## Commands

- `pnpm dev`: web app on :3000 (needs Postgres; `.env` from `.env.example`)
- `pnpm test`: resets the **test** DB (`TEST_DATABASE_URL`), migrates, seeds, and runs Vitest in `packages/core`
- `pnpm lint && pnpm typecheck && pnpm build`: what CI runs, plus tests
- `pnpm db:generate`: new migration from `packages/db/src/schema.ts`; `pnpm db:reset` rebuilds the dev DB
- Custom SQL migration (policies, functions): `cd packages/db && npx drizzle-kit generate --custom --name <name>`

## Tenant isolation (non-negotiable)

- Tenant isolation is enforced in **Postgres RLS**, not app code. See `packages/db/migrations/0001_rls.sql`.
- All request-path DB access goes through `withTenant({ userId, locationId }, fn)` (web: `inLocation()` / `inAgency()` in `apps/web/lib/context.ts`). It drops to the `app_user` role, so policies apply.
- `withSystem()` runs on the owner role and **bypasses RLS**. Use it only for trusted code (seed, worker, webhooks, first-login provisioning), and always filter by `location_id` yourself.
- Every new table with a `location_id`:
  1. gets the base columns (`id, location_id, created_at, updated_at, created_by, deleted_at`) via `tenant()` in `schema.ts`;
  2. in a custom migration: `SELECT app.apply_tenant_policies('<table>', 'read', 'write');` plus column-level `GRANT UPDATE (...)` that leaves out `location_id`.
  The guardrail tests in `packages/core/tests/isolation.test.ts` fail if a table has no RLS or no tenant policy, or if `app_user` can DELETE anything.
- Add an isolation test for every new tenant table (another sub-account can't read it, insert into it, or update it).
- Soft-delete only (`deleted_at`). `app_user` has no DELETE grant.

## Conventions

- Every mutation goes through a service in `packages/core/src/services/*` and calls `recordChange(tx, actor, {...})`, which writes the `audit_log` row and the domain event (`contact.created`, `location.updated`…) in the same transaction.
- Services take `tx` first and throw `ValidationError` / `ForbiddenError` / `NotFoundError`. Server actions turn those into `{ error }` via `actionError()`.
- RLS denials surface as SQLSTATE 42501. An UPDATE on a row you can't touch returns 0 rows (treat that as not found).
- Phones are stored E.164 (`toE164`). Times are stored UTC and shown in the sub-account's `timezone`.
- Roles: `agency_admin`, `agency_viewer` (read-only everywhere), `location_admin`, `user`. Agency roles apply to every location in the agency.
- Next.js 16 (`apps/web/AGENTS.md`): read `node_modules/next/dist/docs/` before using unfamiliar APIs. `cacheComponents` is intentionally **off**, because every page is per-user and per-tenant.
- URLs carry the tenant: `/l/[locationId]/<module>`. The sidebar order and phase gating live in `apps/web/components/shell/nav.ts`. Bump `SHIPPED_PHASE` when a phase ships.
- `audit_log` is append-only (trigger), including for the owner role.
