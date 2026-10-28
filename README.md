# Tidal OS

Internal multi-tenant CRM and marketing-automation platform for Tidal Consulting and its portfolio companies, modeled on GoHighLevel. **[SPEC.md](SPEC.md)** is the source of truth. **[PLAN.md](PLAN.md)** has the build plan and phase status.

## Run it locally

A step-by-step guide with screenshots, written for non-developers, is in **[docs/launch-guide.pdf](docs/launch-guide.pdf)**. Its HTML source is in `docs/launch-guide/`.

Requires Node 22, pnpm 10 and Postgres 16 (local install, or `docker compose up -d`).

```bash
cp .env.example .env            # then set SESSION_SECRET to a long random string
pnpm install
pnpm db:reset                   # drop, migrate and seed the database in DATABASE_URL
pnpm dev                        # http://localhost:3000
```

With `AUTH_MODE=dev`, the login page lists the seeded users. Pick one to sign in:

| User | Access |
| --- | --- |
| admin@tidal.test | Agency admin: every sub-account, agency view |
| viewer@tidal.test | Agency viewer: every sub-account, read-only |
| govpointe-admin@tidal.test | Sub-account admin: GovPointe |
| govpointe@tidal.test | User: GovPointe |
| gaia@tidal.test | User: Gaia Homes |
| honchar@tidal.test | Sub-account admin: Honchar Auto + Honchar Remodeling |

Google sign-in uses Supabase Auth: set `AUTH_MODE=supabase`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `ALLOWED_EMAIL_DOMAINS`. Dev mode is refused when `NODE_ENV=production` unless `ALLOW_DEV_AUTH=1`.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm dev` / `pnpm build` | Next.js app |
| `pnpm test` | Resets `TEST_DATABASE_URL`, then runs the tenant-isolation and service tests |
| `pnpm lint` / `pnpm typecheck` | ESLint + tsc across the workspace |
| `pnpm db:generate` | Generate a migration from `packages/db/src/schema.ts` |
| `pnpm db:migrate` / `pnpm db:seed` / `pnpm db:reset` | Apply migrations / seed (idempotent) / drop + migrate + seed |

## Layout

```
apps/web         Next.js App Router UI + server actions
packages/db      Drizzle schema, SQL migrations (incl. RLS), withTenant(), recordChange()
packages/core    Service layer (one file per domain), seed, tests
```
