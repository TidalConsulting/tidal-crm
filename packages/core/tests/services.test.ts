import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { schema } from "@tidal/db";
import {
  addMember,
  createContact,
  createLocation,
  ForbiddenError,
  listContacts,
  NotFoundError,
  provisionUser,
  toE164,
  updateLocation,
  ValidationError,
} from "../src";
import { as, AGENCY_ID, GAIA, GOVPOINTE, system, U } from "./helpers";

const { auditLog, events, pipelines, dashboards, memberships } = schema;
const actor = (userId: string) => ({ type: "user" as const, userId });

describe("every mutation writes an audit row and an event", () => {
  it("contact.created", async () => {
    const c = await as(U.govpointe, GOVPOINTE, (tx) =>
      createContact(tx, actor(U.govpointe), GOVPOINTE, { firstName: "Audit", lastName: "Me", email: "Audit.Me@Example.com", phone: "(407) 555-0199" }),
    );
    expect(c.email).toBe("audit.me@example.com");
    expect(c.phone).toBe("+14075550199");
    const [a, e] = await system(async (tx) => [
      await tx.select().from(auditLog).where(eq(auditLog.entityId, c.id)),
      await tx.select().from(events).where(eq(events.entityId, c.id)),
    ]);
    expect(a).toHaveLength(1);
    expect(a![0]).toMatchObject({ action: "contact.created", actorId: U.govpointe, locationId: GOVPOINTE });
    expect(e).toHaveLength(1);
    expect(e![0]).toMatchObject({ type: "contact.created", locationId: GOVPOINTE, processedAt: null });
  });

  it("dedupes on email within a sub-account but not across sub-accounts", async () => {
    await as(U.govpointe, GOVPOINTE, (tx) => createContact(tx, actor(U.govpointe), GOVPOINTE, { email: "dupe@example.com" }));
    await expect(
      as(U.govpointe, GOVPOINTE, (tx) => createContact(tx, actor(U.govpointe), GOVPOINTE, { email: "DUPE@example.com" })),
    ).rejects.toBeInstanceOf(ValidationError);
    const other = await as(U.gaia, GAIA, (tx) => createContact(tx, actor(U.gaia), GAIA, { email: "dupe@example.com" }));
    expect(other.locationId).toBe(GAIA);
  });
});

describe("sub-accounts", () => {
  it("agency admin creates one with a default pipeline and dashboard", async () => {
    const loc = await as(U.admin, null, (tx) => createLocation(tx, actor(U.admin), AGENCY_ID, { name: "Test Co", timezone: "America/Chicago" }));
    expect(loc.slug).toBe("test-co");
    const [p, d, a] = await system(async (tx) => [
      await tx.select().from(pipelines).where(eq(pipelines.locationId, loc.id)),
      await tx.select().from(dashboards).where(eq(dashboards.locationId, loc.id)),
      await tx.select().from(auditLog).where(and(eq(auditLog.entityId, loc.id), eq(auditLog.action, "location.created"))),
    ]);
    expect(p).toHaveLength(1);
    expect(d).toHaveLength(1);
    expect(a).toHaveLength(1);
  });

  it("non-agency users can't create one", async () => {
    await expect(
      as(U.govpointeAdmin, null, (tx) => createLocation(tx, actor(U.govpointeAdmin), AGENCY_ID, { name: "Nope" })),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("only admins edit the business profile", async () => {
    await expect(
      as(U.govpointe, GOVPOINTE, (tx) => updateLocation(tx, actor(U.govpointe), GOVPOINTE, { legalName: "Nope LLC" })),
    ).rejects.toBeInstanceOf(NotFoundError);
    const loc = await as(U.govpointeAdmin, GOVPOINTE, (tx) =>
      updateLocation(tx, actor(U.govpointeAdmin), GOVPOINTE, { legalName: "GovPointe Holdings LLC", phoneNumber: "+12025550100" }),
    );
    expect(loc.legalName).toBe("GovPointe Holdings LLC");
  });

  it("rejects bad input", async () => {
    await expect(
      as(U.admin, GOVPOINTE, (tx) => updateLocation(tx, actor(U.admin), GOVPOINTE, { phoneNumber: "555-0100" })),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("team", () => {
  it("an invited user gets access to exactly that sub-account, and keeps it after first login", async () => {
    await as(U.admin, null, (tx) => addMember(tx, actor(U.admin), { email: "New.Hire@tidal.test", role: "user", locationId: GAIA }));
    // First Google login: Supabase assigns its own id; the invited row is re-keyed to it.
    const authId = "11111111-1111-4111-8111-111111111111";
    const u = await provisionUser({ id: authId, email: "new.hire@tidal.test", name: "New Hire" });
    expect(u.id).toBe(authId);
    const rows = await as(authId, null, (tx) => tx.select({ loc: schema.contacts.locationId }).from(schema.contacts));
    expect(rows.length).toBeGreaterThan(0);
    expect(new Set(rows.map((r) => r.loc))).toEqual(new Set([GAIA]));
  });

  it("sub-account admins can add members to their own sub-account only", async () => {
    const m = await as(U.govpointeAdmin, null, (tx) =>
      addMember(tx, actor(U.govpointeAdmin), { email: "gp2@tidal.test", role: "user", locationId: GOVPOINTE }),
    );
    expect(m.locationId).toBe(GOVPOINTE);
    await expect(
      as(U.govpointeAdmin, null, (tx) => addMember(tx, actor(U.govpointeAdmin), { email: "gp3@tidal.test", role: "user", locationId: GAIA })),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      as(U.govpointeAdmin, null, (tx) => addMember(tx, actor(U.govpointeAdmin), { email: "gp3@tidal.test", role: "agency_admin", agencyId: AGENCY_ID })),
    ).rejects.toBeInstanceOf(ForbiddenError);
    // No user row was created for the rejected invite.
    const [row] = await system((tx) => tx.select().from(schema.users).where(eq(schema.users.email, "gp3@tidal.test")));
    expect(row).toBeUndefined();
  });

  it("re-adding a member changes their role instead of duplicating", async () => {
    await as(U.admin, null, (tx) => addMember(tx, actor(U.admin), { email: "gp2@tidal.test", role: "location_admin", locationId: GOVPOINTE }));
    const rows = await system((tx) =>
      tx.select().from(memberships).innerJoin(schema.users, eq(schema.users.id, memberships.userId)).where(eq(schema.users.email, "gp2@tidal.test")),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.memberships.role).toBe("location_admin");
  });
});

describe("contacts list", () => {
  it("paginates and searches server-side", async () => {
    const page = await as(U.gaia, GAIA, (tx) => listContacts(tx, { locationId: GAIA, pageSize: 20, page: 2 }));
    expect(page.rows).toHaveLength(20);
    expect(page.total).toBeGreaterThanOrEqual(50);
    const first = page.rows[0]!;
    const found = await as(U.gaia, GAIA, (tx) => listContacts(tx, { locationId: GAIA, q: first.email! }));
    expect(found.rows.map((r) => r.id)).toContain(first.id);
  });

  it("returns nothing for a sub-account you can't access, even when you ask for it", async () => {
    const page = await as(U.govpointe, GOVPOINTE, (tx) => listContacts(tx, { locationId: GAIA }));
    expect(page.total).toBe(0);
  });
});

describe("toE164", () => {
  it.each([
    ["(407) 555-0100", "+14075550100"],
    ["1-407-555-0100", "+14075550100"],
    ["+44 20 7946 0958", "+442079460958"],
    ["555-0100", null],
    ["", null],
  ])("%s → %s", (input, out) => expect(toE164(input)).toBe(out));
});
