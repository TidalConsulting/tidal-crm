# Master prompt

Paste this into Claude Code at the start of a build session. Module 8 now includes dashboards (added Oct 28, 2026).

```markdown
You are building "Tidal OS", an internal, multi-tenant CRM and marketing-automation platform modeled on GoHighLevel. Read SPEC.md in this repo before doing anything; it is the source of truth.

Context:
- One AGENCY workspace (Tidal Consulting) owns many SUB-ACCOUNTS, one per portfolio company (GovPointe, Gaia Homes, Honchar Auto, Honchar Remodeling, United Property Experts, FedFiles, TC Marketing). New sub-accounts must be creatable in under a minute, optionally from a SNAPSHOT (a saved template of pipelines, custom fields, tags, workflows, forms, calendars and snippets).
- Every record belongs to exactly one sub-account. Tenant isolation is non-negotiable: enforce it in the database with Postgres row-level security on location_id, not only in app code. Write a test that proves a user in sub-account A cannot read or write sub-account B.
- Agency-level users can switch between sub-accounts from a switcher in the top bar and see roll-up reporting across all of them.

Core modules (build in the order in SPEC.md section 9):
1. Auth, agency, sub-accounts, users, roles (agency admin, sub-account admin, user), sub-account switcher.
2. Contacts and companies: custom fields per sub-account, tags, notes, tasks, activity timeline, CSV import/export, dedupe on email/phone, smart lists (saved filters).
3. Opportunities: multiple pipelines per sub-account, custom stages, Kanban board with drag-and-drop, deal value, owner, source, won/lost/abandoned status, stage history.
4. Conversations: one unified inbox per sub-account for email (send + inbound) and SMS (Twilio), threaded per contact, assignment, unread state, snippets, internal comments.
5. Calendars: bookable calendars with availability rules, round-robin, public booking page, Google Calendar 2-way sync, reminders.
6. Forms: drag-and-drop form builder, embeddable script/iframe, hosted URL, submissions create or update contacts and fire workflow triggers.
7. Workflow engine: visual builder with triggers, actions, if/else, wait, goal steps, per-contact execution log. Use a durable job queue so waits survive restarts.
8. Reporting and dashboards: a customizable widget dashboard per sub-account (drag-and-drop grid, widget library, date range with prior-period compare, drill-down to records, sharing, PDF/CSV export, weekly digest) plus an agency roll-up dashboard (SPEC.md section 6, "Dashboards").
9. Proposals/invoices with Stripe payment links, review requests, broadcasts, AI assist.
10. Projects + revenue share + Google Sheets two-way sync (SPEC.md "Projects, revenue share and Google Sheets sync"): projects keyed by normalized property address, linked to one GC and many subcontractors; a transaction ledger that computes GC profit and Tidal's share (default 50%); per-column field mapping to the GC's existing sheet, 5-minute polling plus Drive change notifications, batched write-back, conflict rule per column, an unmatched-rows queue, and a full cell-level sync log.

Engineering rules:
- Stack: Next.js (App Router) + TypeScript, Postgres via Supabase, Prisma or Drizzle, Tailwind + shadcn/ui, BullMQ on Redis (or Inngest) for jobs, Twilio, Resend or SendGrid, Stripe, Anthropic API for AI features.
- Every table has id (uuid), location_id, created_at, updated_at, created_by. Soft-delete with deleted_at.
- Every mutation writes an audit_log row and emits a domain event (e.g. contact.created, opportunity.stage_changed) to an events table; the workflow engine subscribes to these events.
- Expose a REST API with per-sub-account API keys and outbound webhooks for every domain event.
- Seed script creates the agency, all seven sub-accounts, two pipelines each and 50 fake contacts each.
- Write tests for tenant isolation, workflow execution and inbound webhooks.

Start in plan mode. Propose the folder structure, schema and phase 1 task list, then wait for my approval. Build one phase at a time and stop at the end of each phase for review.
```
