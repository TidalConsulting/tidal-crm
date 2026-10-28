-- Tenant isolation (PLAN.md §3).
--
-- The app connects as the table owner and, per request, runs
--   set local role app_user;
--   set_config('app.user_id', <uuid>, true);
--   set_config('app.location_id', <uuid or ''>, true);   -- the "pin"
-- inside a transaction. app_user does not own the tables, so every policy below applies.
-- Trusted system code (worker, webhooks, seed) stays on the owner role and bypasses RLS.

CREATE SCHEMA IF NOT EXISTS app;
--> statement-breakpoint

-- Supabase provides auth.uid(). Locally, and in CI, we stub it so the same policies run anywhere.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'auth' AND p.proname = 'uid'
  ) THEN
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $f$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;
  END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user NOLOGIN;
  END IF;
END $$;
--> statement-breakpoint

DO $$ BEGIN EXECUTE format('GRANT app_user TO %I', current_user); END $$;
--> statement-breakpoint

-- ── Context ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION app.current_user_id() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('app.user_id', true), '')::uuid, auth.uid())
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.pinned_location_id() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.location_id', true), '')::uuid
$$;
--> statement-breakpoint

-- Locations the current user may act on at a given level, intersected with the pin.
--   read  : any membership (agency_viewer included)
--   write : agency_admin, location_admin, user
--   admin : agency_admin, location_admin
-- Agency memberships grant the same role on every location of that agency.
-- Returns an array so policies can evaluate it once per statement:
--   location_id = any((select app.location_ids('read'))::uuid[])
CREATE OR REPLACE FUNCTION app.location_ids(min_level text) RETURNS uuid[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT coalesce(array_agg(DISTINCT x.id), '{}')
  FROM (
    SELECT m.location_id AS id, m.role
    FROM memberships m
    JOIN locations l ON l.id = m.location_id AND l.deleted_at IS NULL
    WHERE m.user_id = app.current_user_id() AND m.deleted_at IS NULL
    UNION ALL
    SELECT l.id, m.role
    FROM memberships m
    JOIN locations l ON l.agency_id = m.agency_id AND l.deleted_at IS NULL
    WHERE m.user_id = app.current_user_id() AND m.deleted_at IS NULL
  ) x
  WHERE (app.pinned_location_id() IS NULL OR x.id = app.pinned_location_id())
    AND CASE min_level
      WHEN 'read'  THEN true
      WHEN 'write' THEN x.role IN ('agency_admin', 'location_admin', 'user')
      WHEN 'admin' THEN x.role IN ('agency_admin', 'location_admin')
      ELSE false
    END
$$;
--> statement-breakpoint

-- Agencies the current user belongs to.
--   read   : agency members plus members of any of its locations
--   member : agency memberships only (admin or viewer)
--   admin  : agency_admin
CREATE OR REPLACE FUNCTION app.agency_ids(min_level text) RETURNS uuid[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT coalesce(array_agg(DISTINCT x.id), '{}')
  FROM (
    SELECT m.agency_id AS id, m.role
    FROM memberships m
    WHERE m.user_id = app.current_user_id() AND m.agency_id IS NOT NULL AND m.deleted_at IS NULL
    UNION ALL
    SELECT l.agency_id, 'location_' || m.role
    FROM memberships m
    JOIN locations l ON l.id = m.location_id
    WHERE m.user_id = app.current_user_id() AND m.deleted_at IS NULL
  ) x
  WHERE CASE min_level
      WHEN 'read'   THEN true
      WHEN 'member' THEN x.role IN ('agency_admin', 'agency_viewer')
      WHEN 'admin'  THEN x.role = 'agency_admin'
      ELSE false
    END
$$;
--> statement-breakpoint

-- ── Standard policy set for tenant tables ───────────────────────────────────
-- Every table with a NOT NULL location_id gets the same four policies. Phase 2+ tables call
--   SELECT app.apply_tenant_policies('<table>', 'read', 'write');
-- No DELETE policy: records are soft-deleted (deleted_at), so hard deletes by app_user affect 0 rows.

CREATE OR REPLACE FUNCTION app.apply_tenant_policies(tbl text, read_level text, write_level text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
  EXECUTE format('DROP POLICY IF EXISTS tenant_select ON %I', tbl);
  EXECUTE format('DROP POLICY IF EXISTS tenant_insert ON %I', tbl);
  EXECUTE format('DROP POLICY IF EXISTS tenant_update ON %I', tbl);
  EXECUTE format(
    'CREATE POLICY tenant_select ON %I FOR SELECT TO app_user USING (location_id = any((SELECT app.location_ids(%L))::uuid[]))',
    tbl, read_level);
  EXECUTE format(
    'CREATE POLICY tenant_insert ON %I FOR INSERT TO app_user WITH CHECK (location_id = any((SELECT app.location_ids(%L))::uuid[]))',
    tbl, write_level);
  EXECUTE format(
    'CREATE POLICY tenant_update ON %I FOR UPDATE TO app_user USING (location_id = any((SELECT app.location_ids(%L))::uuid[])) WITH CHECK (location_id = any((SELECT app.location_ids(%L))::uuid[]))',
    tbl, write_level, write_level);
END $$;
--> statement-breakpoint

SELECT app.apply_tenant_policies('contacts', 'read', 'write');
--> statement-breakpoint
SELECT app.apply_tenant_policies('pipelines', 'read', 'admin');
--> statement-breakpoint
SELECT app.apply_tenant_policies('pipeline_stages', 'read', 'admin');
--> statement-breakpoint
SELECT app.apply_tenant_policies('api_keys', 'admin', 'admin');
--> statement-breakpoint

-- ── Agency-level and identity tables ────────────────────────────────────────

ALTER TABLE agencies ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY agencies_select ON agencies FOR SELECT TO app_user
  USING (id = any((SELECT app.agency_ids('read'))::uuid[]));
--> statement-breakpoint
CREATE POLICY agencies_update ON agencies FOR UPDATE TO app_user
  USING (id = any((SELECT app.agency_ids('admin'))::uuid[]))
  WITH CHECK (id = any((SELECT app.agency_ids('admin'))::uuid[]));
--> statement-breakpoint

ALTER TABLE snapshots ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY snapshots_select ON snapshots FOR SELECT TO app_user
  USING (agency_id = any((SELECT app.agency_ids('read'))::uuid[]));
--> statement-breakpoint
CREATE POLICY snapshots_insert ON snapshots FOR INSERT TO app_user
  WITH CHECK (agency_id = any((SELECT app.agency_ids('admin'))::uuid[]));
--> statement-breakpoint
CREATE POLICY snapshots_update ON snapshots FOR UPDATE TO app_user
  USING (agency_id = any((SELECT app.agency_ids('admin'))::uuid[]))
  WITH CHECK (agency_id = any((SELECT app.agency_ids('admin'))::uuid[]));
--> statement-breakpoint

-- Locations: id is the tenant key. Creating one needs agency_admin. Editing the business
-- profile needs location admin. agency_id and stripe_account_id can't be changed by app_user (column grants below).
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Agency members see every location of their agency, unpinned. That also lets INSERT … RETURNING
-- work: location_ids() can't see a row the current statement is inserting.
CREATE POLICY locations_select ON locations FOR SELECT TO app_user
  USING (id = any((SELECT app.location_ids('read'))::uuid[]) OR agency_id = any((SELECT app.agency_ids('member'))::uuid[]));
--> statement-breakpoint
CREATE POLICY locations_insert ON locations FOR INSERT TO app_user
  WITH CHECK (agency_id = any((SELECT app.agency_ids('admin'))::uuid[]));
--> statement-breakpoint
CREATE POLICY locations_update ON locations FOR UPDATE TO app_user
  USING (id = any((SELECT app.location_ids('admin'))::uuid[]))
  WITH CHECK (id = any((SELECT app.location_ids('admin'))::uuid[]));
--> statement-breakpoint

-- Users: you can see yourself and anyone who shares a sub-account or agency with you.
-- Rows are created by trusted code on first login, never by app_user.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY users_select ON users FOR SELECT TO app_user
  USING (
    id = app.current_user_id()
    OR EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.user_id = users.id AND m.deleted_at IS NULL
        AND (m.location_id = any((SELECT app.location_ids('read'))::uuid[])
             OR m.agency_id = any((SELECT app.agency_ids('read'))::uuid[]))
    )
  );
--> statement-breakpoint
CREATE POLICY users_update_self ON users FOR UPDATE TO app_user
  USING (id = app.current_user_id())
  WITH CHECK (id = app.current_user_id());
--> statement-breakpoint

-- Memberships: visible to the member and to anyone in the same scope. Location admins manage
-- their location's members (the role/scope check constraint stops them granting agency roles).
-- Agency admins manage everything in their agency.
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY memberships_select ON memberships FOR SELECT TO app_user
  USING (
    user_id = app.current_user_id()
    OR location_id = any((SELECT app.location_ids('read'))::uuid[])
    OR agency_id = any((SELECT app.agency_ids('read'))::uuid[])
  );
--> statement-breakpoint
CREATE POLICY memberships_insert ON memberships FOR INSERT TO app_user
  WITH CHECK (
    location_id = any((SELECT app.location_ids('admin'))::uuid[])
    OR agency_id = any((SELECT app.agency_ids('admin'))::uuid[])
  );
--> statement-breakpoint
CREATE POLICY memberships_update ON memberships FOR UPDATE TO app_user
  USING (
    location_id = any((SELECT app.location_ids('admin'))::uuid[])
    OR agency_id = any((SELECT app.agency_ids('admin'))::uuid[])
  )
  WITH CHECK (
    location_id = any((SELECT app.location_ids('admin'))::uuid[])
    OR agency_id = any((SELECT app.agency_ids('admin'))::uuid[])
  );
--> statement-breakpoint

-- ── Dashboards ──────────────────────────────────────────────────────────────
-- Private dashboards are visible only to their owner. Shared/default ones are visible to the whole scope.
-- Owners edit their own. Admins of the scope edit any.

ALTER TABLE dashboards ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY dashboards_select ON dashboards FOR SELECT TO app_user
  USING (
    (location_id = any((SELECT app.location_ids('read'))::uuid[]) OR agency_id = any((SELECT app.agency_ids('read'))::uuid[]))
    AND (shared OR is_default OR owner_id = app.current_user_id())
  );
--> statement-breakpoint
CREATE POLICY dashboards_insert ON dashboards FOR INSERT TO app_user
  WITH CHECK (
    (owner_id = app.current_user_id()
      AND (location_id = any((SELECT app.location_ids('read'))::uuid[]) OR agency_id = any((SELECT app.agency_ids('read'))::uuid[])))
    OR location_id = any((SELECT app.location_ids('admin'))::uuid[])
    OR agency_id = any((SELECT app.agency_ids('admin'))::uuid[])
  );
--> statement-breakpoint
CREATE POLICY dashboards_update ON dashboards FOR UPDATE TO app_user
  USING (
    (owner_id = app.current_user_id()
      AND (location_id = any((SELECT app.location_ids('read'))::uuid[]) OR agency_id = any((SELECT app.agency_ids('read'))::uuid[])))
    OR location_id = any((SELECT app.location_ids('admin'))::uuid[])
    OR agency_id = any((SELECT app.agency_ids('admin'))::uuid[])
  )
  WITH CHECK (
    (owner_id = app.current_user_id()
      AND (location_id = any((SELECT app.location_ids('read'))::uuid[]) OR agency_id = any((SELECT app.agency_ids('read'))::uuid[])))
    OR location_id = any((SELECT app.location_ids('admin'))::uuid[])
    OR agency_id = any((SELECT app.agency_ids('admin'))::uuid[])
  );
--> statement-breakpoint

-- Widgets follow their dashboard. The subquery runs under dashboards' own RLS.
ALTER TABLE dashboard_widgets ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY dashboard_widgets_select ON dashboard_widgets FOR SELECT TO app_user
  USING (EXISTS (SELECT 1 FROM dashboards d WHERE d.id = dashboard_widgets.dashboard_id));
--> statement-breakpoint
CREATE POLICY dashboard_widgets_insert ON dashboard_widgets FOR INSERT TO app_user
  WITH CHECK (EXISTS (
    SELECT 1 FROM dashboards d
    WHERE d.id = dashboard_widgets.dashboard_id
      AND d.location_id IS NOT DISTINCT FROM dashboard_widgets.location_id
      AND d.agency_id IS NOT DISTINCT FROM dashboard_widgets.agency_id
      AND (d.owner_id = app.current_user_id()
           OR d.location_id = any((SELECT app.location_ids('admin'))::uuid[])
           OR d.agency_id = any((SELECT app.agency_ids('admin'))::uuid[]))
  ));
--> statement-breakpoint
CREATE POLICY dashboard_widgets_update ON dashboard_widgets FOR UPDATE TO app_user
  USING (EXISTS (
    SELECT 1 FROM dashboards d
    WHERE d.id = dashboard_widgets.dashboard_id
      AND (d.owner_id = app.current_user_id()
           OR d.location_id = any((SELECT app.location_ids('admin'))::uuid[])
           OR d.agency_id = any((SELECT app.agency_ids('admin'))::uuid[]))
  ));
--> statement-breakpoint

-- ── Audit log and events ────────────────────────────────────────────────────
-- app_user may only append rows for itself, in scopes it can write to. Reading the audit log
-- needs admin. Events are read by the worker (owner role), not by app_user.

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY audit_log_insert ON audit_log FOR INSERT TO app_user
  WITH CHECK (
    actor_type = 'user' AND actor_id = app.current_user_id()
    AND (location_id = any((SELECT app.location_ids('write'))::uuid[])
         OR (location_id IS NULL AND agency_id = any((SELECT app.agency_ids('admin'))::uuid[])))
  );
--> statement-breakpoint
CREATE POLICY audit_log_select ON audit_log FOR SELECT TO app_user
  USING (
    location_id = any((SELECT app.location_ids('admin'))::uuid[])
    OR (location_id IS NULL AND agency_id = any((SELECT app.agency_ids('admin'))::uuid[]))
  );
--> statement-breakpoint

ALTER TABLE events ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY events_insert ON events FOR INSERT TO app_user
  WITH CHECK (
    location_id = any((SELECT app.location_ids('write'))::uuid[])
    OR (location_id IS NULL AND agency_id = any((SELECT app.agency_ids('admin'))::uuid[]))
  );
--> statement-breakpoint

-- Audit rows are kept for 8+ years (SPEC §4). Nobody updates or deletes them, owner included.
-- Deliberate purges must drop this trigger explicitly.
CREATE OR REPLACE FUNCTION app.audit_log_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END $$;
--> statement-breakpoint
CREATE TRIGGER audit_log_immutable BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION app.audit_log_immutable();
--> statement-breakpoint

-- New events wake the worker (phase 4) without polling.
CREATE OR REPLACE FUNCTION app.notify_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('events_new', NEW.id::text);
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER events_notify AFTER INSERT ON events
  FOR EACH ROW EXECUTE FUNCTION app.notify_event();
--> statement-breakpoint

-- ── updated_at ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION app.touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;
--> statement-breakpoint

DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.table_name FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.column_name = 'updated_at'
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS touch_updated_at ON %I', t);
    EXECUTE format('CREATE TRIGGER touch_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at()', t);
  END LOOP;
END $$;
--> statement-breakpoint

-- ── Grants ──────────────────────────────────────────────────────────────────
-- No DELETE for app_user anywhere (soft delete only). Column grants lock identity/tenant keys.

GRANT USAGE ON SCHEMA public, app, auth TO app_user;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO app_user;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE ON TABLES TO app_user;
--> statement-breakpoint
REVOKE UPDATE ON audit_log, events FROM app_user;
--> statement-breakpoint
REVOKE INSERT, UPDATE ON users FROM app_user;
--> statement-breakpoint
GRANT UPDATE (name, avatar_url, last_location_id, updated_at) ON users TO app_user;
--> statement-breakpoint
REVOKE INSERT, UPDATE ON agencies FROM app_user;
--> statement-breakpoint
GRANT UPDATE (name, branding, settings, updated_at) ON agencies TO app_user;
--> statement-breakpoint
REVOKE UPDATE ON locations FROM app_user;
--> statement-breakpoint
GRANT UPDATE (name, legal_name, timezone, phone_number, email, website, address, sending_domain,
              snapshot_id, archived_at, deleted_at, updated_at) ON locations TO app_user;
--> statement-breakpoint
-- Tenant tables: location_id is fixed once a row exists.
REVOKE UPDATE ON contacts, pipelines, pipeline_stages, api_keys FROM app_user;
--> statement-breakpoint
GRANT UPDATE (first_name, last_name, email, phone, company_id, owner_id, source, dnd_sms, dnd_email,
              lead_score, custom, updated_at, deleted_at) ON contacts TO app_user;
--> statement-breakpoint
GRANT UPDATE (name, position, updated_at, deleted_at) ON pipelines TO app_user;
--> statement-breakpoint
GRANT UPDATE (name, position, probability, updated_at, deleted_at) ON pipeline_stages TO app_user;
--> statement-breakpoint
GRANT UPDATE (name, scopes, last_used_at, updated_at, deleted_at) ON api_keys TO app_user;
