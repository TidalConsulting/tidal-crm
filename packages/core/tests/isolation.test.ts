/**
 * Phase 1 acceptance: a user in GovPointe cannot see (or touch) Gaia contacts.
 * Everything here goes through withTenant(), i.e. the non-owner app_user role, so these
 * are tests of the Postgres policies themselves, not of application code.
 */
import { describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { schema } from "@tidal/db";
import { as, expectDenied, GAIA, GOVPOINTE, HONCHAR_AUTO, HONCHAR_REMODELING, AGENCY_ID, system, U } from "./helpers";

const { contacts, locations, pipelines, memberships, dashboards, auditLog, users } = schema;

/** Ground truth via the owner role (RLS bypassed). */
const countIn = (loc: string) =>
  system(async (tx) => (await tx.select({ id: contacts.id }).from(contacts).where(eq(contacts.locationId, loc))).length);

const gaiaContactId = () =>
  system(async (tx) => (await tx.select({ id: contacts.id }).from(contacts).where(eq(contacts.locationId, GAIA)).limit(1))[0]!.id);

describe("GovPointe user vs Gaia data", () => {
  it("sees only GovPointe contacts when pinned to GovPointe", async () => {
    const rows = await as(U.govpointe, GOVPOINTE, (tx) => tx.select({ loc: contacts.locationId }).from(contacts));
    expect(rows.length).toBeGreaterThanOrEqual(50);
    expect(rows.length).toBe(await countIn(GOVPOINTE));
    expect(new Set(rows.map((r) => r.loc))).toEqual(new Set([GOVPOINTE]));
  });

  it("sees only GovPointe contacts when unpinned", async () => {
    const rows = await as(U.govpointe, null, (tx) => tx.select({ loc: contacts.locationId }).from(contacts));
    expect(new Set(rows.map((r) => r.loc))).toEqual(new Set([GOVPOINTE]));
  });

  it("sees nothing when it pins itself to Gaia", async () => {
    const n = await as(U.govpointe, GAIA, (tx) => tx.select().from(contacts));
    expect(n).toHaveLength(0);
  });

  it("cannot read a Gaia contact by id", async () => {
    const id = await gaiaContactId();
    const rows = await as(U.govpointe, GOVPOINTE, (tx) => tx.select().from(contacts).where(eq(contacts.id, id)));
    expect(rows).toHaveLength(0);
  });

  it("cannot insert a contact into Gaia, pinned or not", async () => {
    for (const pin of [GOVPOINTE, GAIA, null]) {
      await expectDenied(as(U.govpointe, pin, (tx) => tx.insert(contacts).values({ locationId: GAIA, firstName: "Forged" })));
    }
  });

  it("cannot update a Gaia contact", async () => {
    const id = await gaiaContactId();
    const updated = await as(U.govpointe, GOVPOINTE, (tx) =>
      tx.update(contacts).set({ firstName: "Hacked" }).where(eq(contacts.id, id)).returning(),
    );
    expect(updated).toHaveLength(0);
    const [row] = await system((tx) => tx.select().from(contacts).where(eq(contacts.id, id)));
    expect(row!.firstName).not.toBe("Hacked");
  });

  it("cannot move its own contact into Gaia", async () => {
    await expectDenied(
      as(U.govpointe, GOVPOINTE, (tx) => tx.execute(sql`update contacts set location_id = ${GAIA} where location_id = ${GOVPOINTE}`)),
    );
  });

  it("cannot hard-delete contacts anywhere (soft delete only)", async () => {
    await expectDenied(as(U.govpointe, GOVPOINTE, (tx) => tx.delete(contacts).where(eq(contacts.locationId, GOVPOINTE))));
    await expectDenied(as(U.govpointe, GOVPOINTE, (tx) => tx.delete(contacts).where(eq(contacts.locationId, GAIA))));
  });

  it("cannot see Gaia's location, pipelines, members or dashboards", async () => {
    const result = await as(U.govpointe, null, async (tx) => ({
      locations: await tx.select({ id: locations.id }).from(locations),
      pipelines: await tx.select({ loc: pipelines.locationId }).from(pipelines),
      memberships: await tx.select({ loc: memberships.locationId }).from(memberships),
      dashboards: await tx.select({ loc: dashboards.locationId }).from(dashboards),
    }));
    expect(result.locations.map((l) => l.id)).toEqual([GOVPOINTE]);
    expect(result.pipelines.every((p) => p.loc === GOVPOINTE)).toBe(true);
    expect(result.pipelines).toHaveLength(2);
    // Agency-level memberships (location_id null) are visible: those people reach GovPointe through the agency.
    expect(result.memberships.every((m) => m.loc === GOVPOINTE || m.loc === null)).toBe(true);
    expect(result.dashboards.every((d) => d.loc === GOVPOINTE)).toBe(true);
  });

  it("cannot see Gaia's users", async () => {
    const emails = await as(U.govpointe, null, (tx) => tx.select({ email: users.email }).from(users));
    expect(emails.map((e) => e.email)).not.toContain("gaia@tidal.test");
  });

  it("cannot grant itself access to Gaia", async () => {
    await expectDenied(as(U.govpointe, null, (tx) => tx.insert(memberships).values({ userId: U.govpointe, locationId: GAIA, role: "user" })));
  });

  it("cannot promote itself to sub-account admin", async () => {
    const rows = await as(U.govpointe, GOVPOINTE, (tx) =>
      tx.update(memberships).set({ role: "location_admin" }).where(eq(memberships.userId, U.govpointe)).returning(),
    );
    expect(rows).toHaveLength(0);
  });

  it("cannot create sub-accounts", async () => {
    await expectDenied(as(U.govpointe, null, (tx) => tx.insert(locations).values({ agencyId: AGENCY_ID, name: "Rogue", slug: "rogue" })));
  });
});

describe("other roles", () => {
  it("Gaia user sees only Gaia", async () => {
    const rows = await as(U.gaia, null, (tx) => tx.select({ loc: contacts.locationId }).from(contacts));
    expect(rows.length).toBeGreaterThanOrEqual(50);
    expect(rows.length).toBe(await countIn(GAIA));
    expect(new Set(rows.map((r) => r.loc))).toEqual(new Set([GAIA]));
  });

  it("agency admin sees every sub-account unpinned, and exactly one when pinned", async () => {
    const all = await as(U.admin, null, (tx) => tx.select({ loc: contacts.locationId }).from(contacts));
    expect(new Set(all.map((r) => r.loc)).size).toBe(7);
    const pinned = await as(U.admin, GAIA, (tx) => tx.select({ loc: contacts.locationId }).from(contacts));
    expect(new Set(pinned.map((r) => r.loc))).toEqual(new Set([GAIA]));
  });

  it("agency viewer reads everything but cannot write", async () => {
    const all = await as(U.viewer, null, (tx) => tx.select({ loc: contacts.locationId }).from(contacts));
    expect(new Set(all.map((r) => r.loc)).size).toBe(7);
    await expectDenied(as(U.viewer, GAIA, (tx) => tx.insert(contacts).values({ locationId: GAIA, firstName: "Nope" })));
    const updated = await as(U.viewer, GAIA, (tx) => tx.update(contacts).set({ firstName: "Nope" }).returning());
    expect(updated).toHaveLength(0);
  });

  it("a user in two sub-accounts sees both and nothing else", async () => {
    const rows = await as(U.honchar, null, (tx) => tx.select({ loc: contacts.locationId }).from(contacts));
    expect(new Set(rows.map((r) => r.loc))).toEqual(new Set([HONCHAR_AUTO, HONCHAR_REMODELING]));
  });

  it("sub-account admin cannot manage another sub-account or grant agency roles", async () => {
    await expectDenied(as(U.govpointeAdmin, null, (tx) => tx.insert(memberships).values({ userId: U.govpointeAdmin, locationId: GAIA, role: "user" })));
    await expectDenied(as(U.govpointeAdmin, null, (tx) => tx.insert(memberships).values({ userId: U.govpointeAdmin, agencyId: AGENCY_ID, role: "agency_admin" })));
  });

  it("no user context sees nothing", async () => {
    const rows = await as("00000000-0000-4000-8000-000000000000", null, (tx) => tx.select().from(contacts));
    expect(rows).toHaveLength(0);
  });
});

describe("audit log", () => {
  it("can't be forged for another actor or another sub-account", async () => {
    await expectDenied(
      as(U.govpointe, GOVPOINTE, (tx) =>
        tx.insert(auditLog).values({ actorType: "user", actorId: U.admin, locationId: GOVPOINTE, action: "x", entity: "contact" }),
      ),
    );
    await expectDenied(
      as(U.govpointe, GOVPOINTE, (tx) =>
        tx.insert(auditLog).values({ actorType: "user", actorId: U.govpointe, locationId: GAIA, action: "x", entity: "contact" }),
      ),
    );
  });

  it("is append-only, even for the owner role", async () => {
    await system((tx) => tx.insert(auditLog).values({ actorType: "system", locationId: GOVPOINTE, action: "test", entity: "test" }));
    await expect(system((tx) => tx.execute(sql`delete from audit_log where entity = 'test'`))).rejects.toThrow();
    await expect(system((tx) => tx.execute(sql`update audit_log set action = 'y' where entity = 'test'`))).rejects.toThrow();
  });
});

describe("schema guardrails", () => {
  it("every public table has RLS enabled and at least one policy", async () => {
    const rows = await system((tx) =>
      tx.execute<{ table: string; rls: boolean; policies: number }>(sql`
        select c.relname as table, c.relrowsecurity as rls,
               (select count(*)::int from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as policies
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'`),
    );
    const bad = rows.filter((r) => !r.rls || r.policies === 0).map((r) => r.table);
    expect(bad).toEqual([]);
  });

  it("every table with a NOT NULL location_id uses the standard tenant policies", async () => {
    const rows = await system((tx) =>
      tx.execute<{ table: string }>(sql`
        select c.table_name as table from information_schema.columns c
        where c.table_schema = 'public' and c.column_name = 'location_id' and c.is_nullable = 'NO'
          and not exists (select 1 from pg_policies p where p.tablename = c.table_name and p.policyname = 'tenant_select')`),
    );
    expect(rows.map((r) => r.table)).toEqual([]);
  });

  it("app_user has DELETE on no table", async () => {
    const rows = await system((tx) =>
      tx.execute<{ table: string }>(sql`
        select table_name as table from information_schema.role_table_grants
        where grantee = 'app_user' and privilege_type = 'DELETE'`),
    );
    expect(rows).toEqual([]);
  });
});
