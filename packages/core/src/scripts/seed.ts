/**
 * Seed (SPEC: "Seed script creates the agency, all seven sub-accounts, two pipelines each and
 * 50 fake contacts each"). Idempotent: fixed ids derived from stable keys, inserts skip existing rows.
 * Runs as trusted code (owner role).
 */
import "dotenv/config";
import { createHash } from "node:crypto";
import { faker } from "@faker-js/faker";
import { sql } from "drizzle-orm";
import { closeDb, getDb, schema, type Role } from "@tidal/db";
import { DEFAULT_SALES_STAGES, slugify } from "../services/locations";

const { agencies, locations, users, memberships, pipelines, pipelineStages, contacts, dashboards } = schema;

/** Deterministic UUID from a key, so re-running the seed finds the same rows. */
export function seedId(key: string) {
  const h = createHash("md5").update(`tidal-seed:${key}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export const AGENCY_ID = seedId("agency");

export const COMPANIES: { name: string; legalName: string; pipeline: string; stages: [string, number][] }[] = [
  { name: "GovPointe", legalName: "GovPointe LLC", pipeline: "Government Contracts", stages: [["Opportunity Identified", 10], ["Capture", 25], ["Proposal in Progress", 50], ["Submitted", 70], ["Award Pending", 90]] },
  { name: "Gaia Homes", legalName: "Gaia Homes LLC", pipeline: "Home Builds", stages: [["Inquiry", 10], ["Site Visit", 30], ["Design", 50], ["Contract Sent", 75], ["Permitting", 90]] },
  { name: "Honchar Auto", legalName: "Honchar Auto LLC", pipeline: "Vehicle Sales", stages: [["New Inquiry", 10], ["Test Drive", 35], ["Financing", 60], ["Paperwork", 85]] },
  { name: "Honchar Remodeling", legalName: "Honchar Remodeling LLC", pipeline: "Remodel Jobs", stages: [["Inquiry", 10], ["Estimate Scheduled", 30], ["Estimate Sent", 50], ["Contract Signed", 80], ["In Progress", 95]] },
  { name: "United Property Experts", legalName: "United Property Experts LLC", pipeline: "Property Management", stages: [["Owner Lead", 10], ["Walkthrough", 30], ["Proposal", 60], ["Agreement Sent", 85]] },
  { name: "FedFiles", legalName: "FedFiles LLC", pipeline: "Client Onboarding", stages: [["Inquiry", 10], ["Consultation", 30], ["Engagement Letter", 70], ["Onboarding", 90]] },
  { name: "TC Marketing", legalName: "TC Marketing LLC", pipeline: "Client Retainers", stages: [["Lead", 10], ["Discovery Call", 30], ["Proposal", 60], ["Contract", 85]] },
];

export const locationId = (name: string) => seedId(`location:${slugify(name)}`);

/** Test and demo users. Dev-mode login lists these. */
export const SEED_USERS: { key: string; email: string; name: string; memberships: { role: Role; location?: string }[] }[] = [
  { key: "admin", email: "admin@tidal.test", name: "Avery Admin", memberships: [{ role: "agency_admin" }] },
  { key: "viewer", email: "viewer@tidal.test", name: "Vic Viewer", memberships: [{ role: "agency_viewer" }] },
  { key: "govpointe", email: "govpointe@tidal.test", name: "Gail GovPointe", memberships: [{ role: "user", location: "GovPointe" }] },
  { key: "govpointe-admin", email: "govpointe-admin@tidal.test", name: "Grant GovPointe Admin", memberships: [{ role: "location_admin", location: "GovPointe" }] },
  { key: "gaia", email: "gaia@tidal.test", name: "Gabe Gaia", memberships: [{ role: "user", location: "Gaia Homes" }] },
  { key: "honchar", email: "honchar@tidal.test", name: "Hana Honchar", memberships: [{ role: "location_admin", location: "Honchar Auto" }, { role: "location_admin", location: "Honchar Remodeling" }] },
];

export const userId = (key: string) => seedId(`user:${key}`);

export async function seed(url = process.env.DATABASE_URL!, contactsPerLocation = 50) {
  const { db } = getDb(url);
  await db.transaction(async (tx) => {
    await tx.insert(agencies).values({ id: AGENCY_ID, name: "Tidal Consulting" }).onConflictDoNothing();

    for (const c of COMPANIES) {
      const id = locationId(c.name);
      await tx
        .insert(locations)
        .values({ id, agencyId: AGENCY_ID, name: c.name, legalName: c.legalName, slug: slugify(c.name), timezone: "America/New_York" })
        .onConflictDoNothing();

      const pipes: [string, string, [string, number][]][] = [
        ["sales", "Sales", DEFAULT_SALES_STAGES],
        ["custom", c.pipeline, c.stages],
      ];
      for (const [i, [key, name, stages]] of pipes.entries()) {
        const pid = seedId(`pipeline:${id}:${key}`);
        await tx.insert(pipelines).values({ id: pid, locationId: id, name, position: i }).onConflictDoNothing();
        await tx
          .insert(pipelineStages)
          .values(stages.map(([s, probability], pos) => ({ id: seedId(`stage:${pid}:${pos}`), locationId: id, pipelineId: pid, name: s, position: pos, probability })))
          .onConflictDoNothing();
      }

      await tx
        .insert(dashboards)
        .values({ id: seedId(`dashboard:${id}`), locationId: id, name: "Dashboard", shared: true, isDefault: true })
        .onConflictDoNothing();

      faker.seed([...id].reduce((a, ch) => a + ch.charCodeAt(0), 0));
      const sources = ["Website form", "Google Ads", "Facebook", "Referral", "Walk-in", "Phone call", "Tidal marketing"];
      const rows = Array.from({ length: contactsPerLocation }, (_, i) => {
        const firstName = faker.person.firstName();
        const lastName = faker.person.lastName();
        return {
          id: seedId(`contact:${id}:${i}`),
          locationId: id,
          firstName,
          lastName,
          email: `${firstName}.${lastName}.${i}@example.com`.toLowerCase().replace(/[^a-z0-9.@]/g, ""),
          // 555-01xx numbers are reserved for fiction.
          phone: `+1${faker.helpers.arrayElement(["202", "305", "407", "561", "813", "904"])}55501${String(i).padStart(2, "0")}`,
          source: faker.helpers.arrayElement(sources),
          createdAt: faker.date.recent({ days: 90 }),
        };
      });
      await tx.insert(contacts).values(rows).onConflictDoNothing();
    }

    for (const u of SEED_USERS) {
      const uid = userId(u.key);
      await tx.insert(users).values({ id: uid, email: u.email, name: u.name }).onConflictDoNothing();
      for (const m of u.memberships) {
        const scope = m.location ? { locationId: locationId(m.location) } : { agencyId: AGENCY_ID };
        await tx
          .insert(memberships)
          .values({ id: seedId(`membership:${uid}:${m.location ?? "agency"}`), userId: uid, role: m.role, ...scope })
          .onConflictDoNothing();
      }
    }
  });
  const [counts] = await db.execute<{ locations: number; contacts: number; users: number }>(
    sql`select (select count(*)::int from locations) locations, (select count(*)::int from contacts) contacts, (select count(*)::int from users) users`,
  );
  return counts!;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const counts = await seed();
  await closeDb();
  console.log(`seeded: ${counts.locations} sub-accounts, ${counts.contacts} contacts, ${counts.users} users`);
}
