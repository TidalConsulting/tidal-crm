# Tidal OS — Build Spec

Source: "Internal CRM Build Spec (GoHighLevel-Style)", Oct 28, 2026 · Mark. This file is the source of truth for every build session. The master prompt that kicks off each session is in [`docs/master-prompt.md`](docs/master-prompt.md).

**Section order.** These are sections 4–10 of the original doc. The Projects / revenue-share section has been moved after Build phases so that "SPEC.md section 9" in the master prompt points at Build phases. No text was changed except the **Dashboards** additions, which are marked *(added)*.

- §4 Tech stack and architecture
- §5 Data model
- §6 Modules and feature specs
- §7 Workflow engine spec
- §8 UI and navigation
- §9 Build phases and acceptance criteria
- §10 Projects, revenue share and Google Sheets sync (phase 3.5)
- §11 What to skip and integration notes

**Context.** GoHighLevel (GHL) is a multi-tenant sales and marketing OS: one **agency** account sits on top of many **sub-accounts**, and every sub-account gets its own CRM, pipelines, inbox, calendars, workflows, funnels and settings. Here Tidal Consulting is the agency and each portfolio company is a sub-account (GovPointe, Gaia Homes, Honchar Auto, Honchar Remodeling, United Property Experts, FedFiles, TC Marketing). A saved template of a full sub-account setup is a **snapshot** and can be deployed into other sub-accounts.

| Stage | Keep for internal v1 |
| --- | --- |
| Capture | CRM, forms, web chat, inbound SMS/email, missed-call text-back |
| Nurture | Inbox, pipelines, workflows, calendars, snippets, reminders |
| Close | Lead scoring, proposals, invoices, Stripe payment links |
| Evangelize | Review requests (phase 3) |
| Reactivate | Smart lists, email/SMS broadcasts |

---

## 4. Tech stack and architecture

A single Next.js app on Postgres with a separate worker process for the workflow engine is enough for internal scale (tens of users, under 100k contacts).

| Layer | Choice | Why |
| --- | --- | --- |
| Web app | Next.js App Router, TypeScript, Tailwind, shadcn/ui | One codebase for UI and API routes |
| Database | Postgres (Supabase) with row-level security | Tenant isolation enforced at the DB |
| ORM | Drizzle or Prisma | Typed queries, migrations |
| Auth | Supabase Auth or Clerk, Google SSO | Internal team already on Google Workspace |
| Jobs / workflows | BullMQ on Redis, or Inngest | Durable waits, retries, scheduled sends |
| Realtime | Supabase Realtime | Live inbox and Kanban updates |
| SMS / voice | Twilio (one number per sub-account, A2P 10DLC registered) | Inbound webhooks per number |
| Email | Resend or SendGrid, a sending domain per sub-account; Gmail OAuth for 1:1 | Deliverability per brand |
| Payments | Stripe, connected account per company | Invoices and payment links |
| Files | Supabase Storage / S3 | Attachments, form uploads |
| AI | Anthropic API | Reply drafts, call/thread summaries, lead scoring |
| Hosting | Vercel (web) + Railway or Fly (worker, Redis) | Simple, cheap |

Request flow: UI → API route → service layer (checks role + location_id) → DB write + audit_log + event row → worker picks up event → matches active workflows → enqueues steps.

Non-functional requirements:

- Every list view paginates server-side and supports search, sort and saved filters.
- Phone numbers stored E.164; times stored UTC and shown in the sub-account's time zone (default America/New_York).
- SMS sends honor STOP/opt-out and quiet hours per sub-account.
- Daily Postgres backups; audit log kept at least 8 years to match the portfolio's record-retention rule.

## 5. Data model

Every table below except `agencies` and `users` carries `location_id` (the sub-account) plus id, created_at, updated_at, created_by and deleted_at.

| Table | Key fields | Notes |
| --- | --- | --- |
| agencies | name, branding, settings | One row: Tidal Consulting |
| locations (sub-accounts) | agency_id, name, legal_name, timezone, phone_number, sending_domain, stripe_account_id, snapshot_id | One per company |
| users | email, name, avatar | Global identity |
| memberships | user_id, location_id or agency_id, role, permissions json | A user can belong to several sub-accounts |
| contacts | first/last name, email, phone, company_id, owner_id, source, dnd_sms, dnd_email, lead_score, custom json | Unique on (location_id, email) and (location_id, phone) |
| companies | name, domain, address, custom json |  |
| custom_field_defs | object (contact, company, opportunity), key, label, type, options | Types: text, number, date, dropdown, multi-select, checkbox, file, currency |
| tags, contact_tags | name, color | Many-to-many |
| smart_lists | name, filter json, shared | Saved contact filters |
| pipelines, pipeline_stages | name; stage name, position, probability |  |
| opportunities | contact_id, pipeline_id, stage_id, value, status (open/won/lost/abandoned), owner_id, source, close_date |  |
| opportunity_stage_history | opportunity_id, from_stage, to_stage, changed_by, changed_at | Feeds velocity reports |
| conversations | contact_id, channel, assigned_to, unread_count, last_message_at | One per contact per channel |
| messages | conversation_id, direction, channel, body, attachments, status, provider_id, sent_by | Email, SMS, chat, internal note |
| snippets | name, body with merge fields |  |
| tasks | contact_id, opportunity_id, title, due_at, assigned_to, status |  |
| notes | contact_id, body, pinned |  |
| calendars | type (personal, round-robin, collective), slot length, buffers, availability json, team user_ids |  |
| appointments | calendar_id, contact_id, start, end, status, assigned_user, gcal_event_id |  |
| forms, form_submissions | schema json, settings; data json, contact_id |  |
| workflows | name, status (draft/published), trigger json, graph json, version | Graph = nodes + edges |
| workflow_enrollments | workflow_id, contact_id, current_node, status, started_at |  |
| workflow_step_logs | enrollment_id, node_id, result, error, executed_at | Per-contact execution log |
| events | type, entity, entity_id, payload json, processed_at | Domain event bus |
| campaigns (broadcasts) | channel, smart_list_id, content, scheduled_at, stats |  |
| invoices, invoice_items, payments | contact_id, total, status, stripe ids | Phase 3 |
| snapshots | name, payload json | Template of a sub-account's config |
| api_keys, webhooks | key hash, scopes; url, event types, secret |  |
| audit_log | actor, action, entity, before, after |  |
| dashboards *(added)* | name, scope (location or agency), owner_id, shared, is_default, layout json, date_range default | Agency-scope rows have location_id null and agency_id set |
| dashboard_widgets *(added)* | dashboard_id, type, metric, filters json, viz (stat, line, bar, funnel, table, pie), position json, settings json | Widget = one metric query + one visualization |
| metric_daily *(added)* | location_id, date, metric, dimension, dimension_value, value | Nightly + on-event rollup so dashboards don't scan raw tables |

## 6. Modules and feature specs

Each module lists what a user must be able to do; anything not listed is out of scope for v1.

**Agency and sub-accounts**

- Create, edit and archive sub-accounts; apply a snapshot at creation or later.
- Save any sub-account's config as a new snapshot (pipelines, stages, custom fields, tags, workflows, forms, calendars, snippets; never contacts).
- Top-bar switcher lists every sub-account the user belongs to; last-used one is remembered.
- Agency dashboard: leads, booked appointments, pipeline value and won revenue per sub-account for a chosen date range.

**Contacts**

- Table view with column picker, filters on any field or tag, bulk actions (tag, assign, add to workflow, delete, export).
- Contact detail page: left = fields; center = activity timeline (messages, notes, form submissions, appointments, stage changes, workflow events); right = opportunities, tasks, appointments.
- CSV import with field mapping and dedupe preview; merge duplicate contacts.
- Smart lists saved per user or shared.

**Opportunities (pipelines)**

- Kanban per pipeline with drag-and-drop between stages, column totals (count and $ value), filters by owner, source, tag, date.
- List view of the same data; opportunity side panel opens without leaving the board.
- Mark won, lost (with reason) or abandoned; every move logged to stage history.

**Conversations**

- Inbox with All / Unread / Assigned to me / Unassigned tabs; search by contact or message text.
- Thread view merges email, SMS and web chat for one contact; composer picks the channel and sender.
- Snippets with merge fields like {{contact.first_name}}; scheduled send; internal notes visible only to the team.
- Missed-call text-back: an unanswered call to the sub-account number sends a set SMS.

**Calendars**

- Calendar types: personal, round-robin (rotates among a team), collective (all members must be free).
- Availability by weekday, buffers, minimum notice, max bookings per day, date overrides.
- Public booking page and embed; booking form fields map to contact fields.
- Two-way Google Calendar sync; email and SMS confirmations and reminders.

**Forms and surveys**

- Builder with field types (text, email, phone, dropdown, radio, checkbox, date, file, hidden UTM fields); conditional logic for surveys.
- Embed via script tag or iframe, plus a hosted URL; captures UTM params and referrer.
- Submission creates or updates a contact by email/phone and emits `form.submitted`.

**Tasks and notes**

- Task list with due dates, assignee, filters (today, overdue, mine); tasks created manually or by workflows.

**Reporting**

- Per sub-account: leads by source, pipeline value by stage, stage conversion rates, average time in stage, appointments booked/shown/no-show, response time in inbox, workflow enrollments.
- Agency roll-up of the same metrics across sub-accounts.

**Dashboards** *(added)*

- Every sub-account has a default dashboard, which is the landing page; users can create more, keep them private or share them with the sub-account.
- Drag-and-drop grid of widgets that can be resized; add a widget from a library, then set its metric, filters (pipeline, owner, source, tag, date) and visualization (stat tile with delta vs prior period, line, bar, funnel, table, pie).
- Widget library (v1): new leads, leads by source, pipeline value by stage, won revenue, win rate, stage conversion funnel, average time in stage, appointments booked/shown/no-show, inbox response time, unread conversations, tasks due/overdue, workflow enrollments and failures, form submissions; phase 3.5 adds projects by status, collected vs contract, and Tidal share accrued and owed.
- Global date-range picker (today, 7/30/90 days, MTD, QTD, YTD, custom), shown in the sub-account's time zone, with comparison to the prior period.
- Agency dashboard: the same widgets across all sub-accounts the user can see, with a per-sub-account breakdown table and a sub-account filter; drill down from a number to the sub-account's dashboard or the filtered list behind it.
- Click any number to open the records behind it (filtered contacts, opportunities, appointments).
- Export a dashboard to PDF and a widget to CSV; optional scheduled email digest (weekly) of a dashboard.
- Live refresh on new events via Supabase Realtime; widgets read from metric_daily for history plus a live query for today.
- Dashboards are included in snapshots (layout and widgets, never data).

**Phase 3 modules**

- Proposals and estimates with e-signature, invoices with Stripe payment links and text-to-pay.
- Review requests by SMS/email after a won deal or completed appointment, with links to the Google review page.
- Broadcasts: email/SMS campaign to a smart list with scheduling and open/click/reply stats.
- AI: draft replies in the inbox, summarize a contact's history, score leads 0–100 from fields and activity, generate workflow email copy.
- Simple landing pages built from blocks, only if GovPointe or FedFiles needs them; otherwise keep using the existing site builders.

## 7. Workflow engine spec

The workflow engine is the heart of the product: an event-driven graph runner where one trigger starts a contact down a path of actions, waits and branches.

**Execution model**

1. Every domain event lands in the `events` table.
2. The worker matches the event against published workflows in that sub-account (trigger type + trigger filters).
3. A match creates a `workflow_enrollment` for the contact, unless they are already enrolled and re-entry is off.
4. The runner executes nodes in order; each node writes a `workflow_step_logs` row with result or error.
5. Wait nodes schedule a delayed job and release the worker; the job resumes the enrollment at the next node.
6. Goal nodes are checked on every new event for that contact; if met, the contact jumps to the goal and skips the rest.
7. Failed actions retry 3 times with backoff, then mark the step failed and continue or stop (per-node setting).

Workflow settings: allow re-entry (yes/no), stop on reply (yes/no), quiet hours for SMS, time-window sending, sender defaults. Workflows are versioned; publishing a new version does not move contacts already mid-run.

| Triggers (v1) | Actions (v1) | Logic nodes |
| --- | --- | --- |
| Contact created / changed (field filter) | Send email (template or rich text) | If/else on any field, tag, or event |
| Tag added / removed | Send SMS | Wait: fixed time |
| Form submitted (pick form) | Send internal notification (email, SMS, in-app) | Wait: until date/time or field date |
| Appointment booked / rescheduled / cancelled / no-show | Add / remove tag | Wait: until event (reply, email open, link click) with timeout |
| Opportunity created / stage changed / status changed | Update contact field | Goal event (jump on condition) |
| Inbound message received (channel, keyword) | Create / update opportunity, move stage | Split test (A/B by %) |
| Email opened / link clicked | Assign owner (specific user or round-robin) | Go to another workflow |
| Customer replied | Create task | End workflow |
| Missed call | Add to / remove from another workflow |  |
| Birthday / custom date reminder | Outbound webhook (POST with contact json) |  |
| Inbound webhook received | AI step: generate text, classify reply, extract fields |  |
| Invoice paid (phase 3) | Send review request (phase 3) |  |
| Manual (bulk enroll from list) | Add note; set DND |  |

Builder UI: a vertical canvas (React Flow) where the trigger sits on top, steps stack below, and if/else splits into side-by-side branches. Each node opens a right-hand settings drawer. Include a test mode that runs the workflow against one chosen contact and shows each step's output.

Guardrails: detect circular triggers (workflow A tags → workflow B → tags → A) at publish time, and cap any contact at 200 actions per day.

## 8. UI and navigation

Mirror GHL's layout: a fixed left sidebar of modules, a top bar with the sub-account switcher, and a content area that is either a table, a board or a detail page with a side panel.

**Top bar:** sub-account switcher (with search), global search (contacts, opportunities, conversations), quick-add (+ contact, + opportunity, + task), notifications bell, user menu.

**Left sidebar (sub-account view), in this order:**

1. Dashboard
2. Conversations
3. Calendars
4. Contacts (tabs: Contacts, Smart Lists, Companies, Tasks)
5. Opportunities (tabs: Pipelines, Opportunities list)
6. Automation (tabs: Workflows, Snippets, Templates)
7. Sites (tabs: Forms, Surveys, Booking pages)
8. Marketing (phase 3: Broadcasts, Reviews)
9. Payments (phase 3: Invoices, Proposals)
10. Reporting
11. Settings (business profile, users, custom fields, tags, pipelines, calendars, phone numbers, email domains, integrations, API keys, webhooks)

**Agency view sidebar:** Agency dashboard *(added)*, Sub-accounts, Snapshots, Agency reporting, Team, Agency settings.

Design notes: dense, desk-first layout; light and dark mode; keyboard shortcuts for inbox (j/k next/prev, r reply, e close); every table row opens a side panel rather than a new page; mobile-responsive for the inbox, contacts and calendar so the team can work from a phone.

## 9. Build phases and acceptance criteria

Four phases; each ends with a demo and must pass its checks before the next starts.

| Phase | Scope | Done when |
| --- | --- | --- |
| 1. Foundation | Auth, agency, sub-accounts, memberships and roles, switcher, RLS, audit log, events table, seed data, settings shell | A user in GovPointe cannot see Gaia contacts (automated test passes); switching sub-accounts changes every view |
| 2. Core CRM | Contacts, companies, custom fields, tags, smart lists, CSV import, notes, tasks, pipelines + Kanban, opportunity panel, stage history, basic dashboard (default dashboard with fixed widgets, date-range picker) | 1,000-row CSV imports with dedupe; dragging a card logs history and updates totals live |
| 3. Engagement | Inbox (Twilio SMS, email send/receive, web chat widget), snippets, missed-call text-back, calendars + booking pages + Google sync, forms builder + embed | An SMS to a sub-account number lands in its inbox in under 5 s; a booking on the public page creates a contact, appointment and GCal event |
| 4. Automation and revenue | Workflow engine + builder, test mode, reporting + agency roll-up, dashboard builder (custom widgets, sharing, drill-down, PDF/CSV export, weekly digest) *(added)*, snapshots, API keys + webhooks, invoices/Stripe, review requests, broadcasts, AI assist | "Form submitted → tag → wait 1 day → SMS → if no reply, create task" runs end to end with full step log; a new sub-account built from a snapshot has all pipelines, fields and workflows; *(added)* a user builds a custom dashboard, shares it, and the agency dashboard's totals match the sum of the sub-account dashboards |

**Phase 3.5 (pull forward if the GC deal is the first live use):** projects, ledger, revenue-share math and Google Sheets sync (§10). Done when an edit to a payment cell in the GC's sheet updates that project's ledger and Tidal's balance owed within 5 minutes, a status change in the CRM appears in her sheet, and an address typo lands in the unmatched-rows queue instead of creating a duplicate.

Suggested first workflows to build as snapshot defaults: new-lead speed-to-lead (instant SMS + owner alert), appointment reminders (24 h and 1 h), no-show follow-up, stale-deal nudge (no stage change in 7 days → task), and post-close review request.

## 10. Projects, revenue share and Google Sheets sync

Every job is a **project** keyed by its property address, linked to one GC and any number of subcontractors, and its progress and payments stay in two-way sync with the GC's existing Google Sheet. The CRM also computes the GC's profit per project and Tidal's 50% share, so what is owed is always current.

**How a project flows**

1. A lead Tidal's marketing brings in becomes a contact + opportunity in the GC's sub-account (lead source is recorded, so attribution is provable).
2. When the opportunity is marked won, the CRM creates a project at that address, attaches the GC, and adds a row to her sheet if one does not exist.
3. Subcontractors are added to the project with their trade and contract amount.
4. Status changes and payments update from either side: the GC keeps typing in her sheet, or the team updates the CRM, and the other side follows within minutes.
5. At closeout, profit is locked, Tidal's share is invoiced, and the payout is recorded.

**New tables**

| Table | Key fields | Notes |
| --- | --- | --- |
| projects | address_line, city, state, zip, normalized_address, place_id, gc_company_id, opportunity_id, lead_contact_id, status, start_date, est_completion, contract_price, sheet_row_ref | normalized_address is the match key to the sheet |
| project_parties | project_id, company_id, role (GC, subcontractor, supplier), trade, contract_amount, contact_id | One row per company on a job |
| project_milestones | project_id, name, status, due_date, completed_at | Permits, demo, framing, inspections, final |
| project_transactions | project_id, party_id, type (client payment in, draw, sub payment out, material, permit, change order, other cost), amount, date, method, reference, source (crm or sheet) | The ledger that drives profit |
| revenue_share_agreements | gc_company_id, share_pct (default 50), profit_basis, start_date, end_date, terms_doc_url | One per GC; profit_basis defines what counts as cost |
| share_payouts | agreement_id, project_id, amount, status (accrued, invoiced, paid), invoiced_at, paid_at | What the GC owes Tidal |
| sheet_connections | location_id, spreadsheet_id, tab_name, header_row, key_column, direction (pull, push, two-way), poll_minutes, last_synced_at, google_account_id | One per sheet/tab |
| sheet_field_maps | connection_id, sheet_column, crm_entity, crm_field, transform, owner_of_truth (sheet or crm) | Column-to-field mapping set in the UI |
| sheet_sync_log | connection_id, direction, row_ref, field, old_value, new_value, result, conflict, synced_at | Every cell change, both ways |

**Profit and share math**

- Project profit = sum of client payments in (plus approved change orders) − sum of costs out (subs, materials, permits, other), per the agreement's profit_basis.
- Tidal share = profit × share_pct, shown two ways: **accrued** (on money collected to date) and **projected** (on contract price minus budgeted costs).
- Balance owed to Tidal = accrued share − payouts already received.

**Google Sheets sync spec**

- Auth: Google OAuth with the Sheets and Drive scopes on the GC's (or Tidal's) Google account; tokens encrypted per sub-account. A service account the sheet is shared with is an acceptable alternative.
- Setup wizard: paste the sheet URL → pick the tab and header row → pick the key column (address) → map each column to a CRM field → choose, per column, whether the sheet or the CRM wins. Save as a template so the next GC's sheet is mapped in minutes.
- Pull: poll every 5 minutes with the Sheets API values endpoint and diff against the last snapshot; also register a Drive change notification on the file so edits trigger an immediate pull. A manual "Sync now" button on the project and connection pages.
- Push: CRM changes to mapped fields are queued and written back with batched updates (one batchUpdate per sync cycle), respecting the API's per-minute quota with backoff.
- Matching: normalize both sides' addresses (lowercase, standard suffixes like St/Street, strip unit punctuation; optionally geocode to a place_id). Rows that match nothing go to an **Unmatched rows** queue where a user links them to a project or creates one.
- New rows: a new address in the sheet creates a project (status "Needs review"); a new CRM project appends a row.
- Conflicts: if both sides changed the same field since the last sync, the column's owner_of_truth wins, and the losing value is kept in sheet_sync_log and flagged on the project.
- Never delete rows in either direction; a removed sheet row only flags the project.
- Payment columns: if her sheet tracks payments as running columns (e.g. Deposit, Draw 1, Draw 2, Final), map each to a project_transactions row with a fixed type; if it has a separate payments tab, map that tab as its own connection, one row per transaction.

**Workflow additions**

- Triggers: project created, project status changed, milestone completed, payment received, sheet row changed, unmatched sheet row found, share balance over a set amount.
- Actions: update sheet cell(s), create project, add project transaction, create share invoice, notify the GC or a subcontractor by SMS/email.

**Views**

- Projects board grouped by status, card shows address, GC, contract price, collected %, next milestone.
- Project detail: parties, milestones, ledger, profit summary, sync status with last sync time.
- Revenue share dashboard per GC (built on the Dashboards module, with the project widgets): projects, contract value, collected, costs, profit, Tidal's 50%, paid to Tidal, balance owed; filterable by date and status, exportable to CSV/PDF.
- Subcontractor view: every project and address a sub is on, contracted vs paid.

**Open questions for the GC**

- What exactly counts as cost in profit (does her own labor or overhead count)? This sets profit_basis and must match the written agreement.
- Is the share paid per project at closeout or per payment received?
- One sheet with one row per address, or separate tabs for progress and payments? A copy of the sheet (headers plus two sample rows) is enough to finish the mapping.

## 11. What to skip and integration notes

Skip the parts of GHL that exist to resell it: white-labeling, SaaS mode, rebilling with markup, affiliate manager, communities, memberships/courses, and a full website/funnel builder. Also defer Voice AI, WhatsApp, Instagram and Messenger DMs, ringless voicemail and the ad manager until the core is in daily use.

Integration notes:

- **Twilio:** register each brand for A2P 10DLC before sending SMS at volume; route each number's inbound webhook to `/api/webhooks/twilio/{location_id}` and verify the signature.
- **Email:** set SPF, DKIM and DMARC on each company's sending domain; parse inbound via the provider's inbound-parse webhook into `messages`.
- **Google:** one OAuth app for Calendar sync and Gmail 1:1 sending, tokens stored per user, encrypted.
- **Stripe:** use Stripe Connect so each company gets paid into its own account.
- **Existing tools:** add outbound webhooks for Slack alerts and a nightly export to Google Drive; keep the API open so Notion or Fibery can read pipeline data.
- **Migration:** if any company already has data in GHL, export contacts and opportunities to CSV and run them through the phase 2 importer.

Open question: should FedFiles' and GovPointe's government-contracting clients get a client portal later? If so, reserve a `portal_users` table now.
