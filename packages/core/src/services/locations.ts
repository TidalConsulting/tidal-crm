import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { recordChange, schema, type Actor, type Tx } from "@tidal/db";
import { guard, NotFoundError, ValidationError } from "../errors";

const { locations, dashboards, pipelines, pipelineStages } = schema;

export const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "UTC",
] as const;

export function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Every non-deleted sub-account the user can see (run unpinned). Archived ones are included, flagged. */
export async function listLocations(tx: Tx) {
  return tx
    .select({ id: locations.id, name: locations.name, slug: locations.slug, timezone: locations.timezone, archivedAt: locations.archivedAt, agencyId: locations.agencyId })
    .from(locations)
    .where(isNull(locations.deletedAt))
    .orderBy(asc(locations.name));
}

export async function getLocation(tx: Tx, id: string) {
  const [loc] = await tx.select().from(locations).where(and(eq(locations.id, id), isNull(locations.deletedAt)));
  return loc ?? null;
}

export type LocationInput = {
  name: string;
  legalName?: string | null;
  timezone?: string;
  phoneNumber?: string | null;
  email?: string | null;
  website?: string | null;
  address?: string | null;
};

function clean(input: Partial<LocationInput>) {
  const out: Partial<LocationInput> = {};
  for (const [k, v] of Object.entries(input)) {
    if (v === undefined) continue;
    (out as Record<string, unknown>)[k] = typeof v === "string" ? v.trim() || null : v;
  }
  if ("name" in out && !out.name) throw new ValidationError("Name is required");
  if (out.timezone && !(TIMEZONES as readonly string[]).includes(out.timezone)) throw new ValidationError("Unknown time zone");
  if (out.phoneNumber && !/^\+[1-9]\d{6,14}$/.test(out.phoneNumber)) throw new ValidationError("Phone must be E.164, e.g. +15555550100");
  return out;
}

/**
 * Create a sub-account (agency admins only, enforced by RLS) with a default Sales pipeline and a
 * default dashboard. Snapshots replace the defaults in phase 4.
 */
export async function createLocation(tx: Tx, actor: Actor & { type: "user" }, agencyId: string, input: LocationInput) {
  const data = clean(input) as LocationInput;
  let slug = slugify(data.name);
  const [{ n } = { n: 0 }] = await tx.execute<{ n: number }>(
    sql`select count(*)::int as n from locations where agency_id = ${agencyId} and slug like ${slug + "%"}`,
  );
  if (n > 0) slug = `${slug}-${n + 1}`;

  const [loc] = await guard(
    tx.insert(locations).values({ ...data, timezone: data.timezone ?? "America/New_York", agencyId, slug, createdBy: actor.userId }).returning(),
  );
  await createDefaultPipeline(tx, loc!.id, actor.userId);
  await tx.insert(dashboards).values({
    locationId: loc!.id,
    name: "Dashboard",
    ownerId: actor.userId,
    shared: true,
    isDefault: true,
    createdBy: actor.userId,
  });
  await recordChange(tx, actor, {
    type: "location.created",
    entity: "location",
    entityId: loc!.id,
    locationId: loc!.id,
    agencyId,
    after: loc,
  });
  return loc!;
}

export const DEFAULT_SALES_STAGES: [string, number][] = [
  ["New Lead", 10],
  ["Contacted", 20],
  ["Qualified", 40],
  ["Proposal Sent", 60],
  ["Negotiation", 80],
];

export async function createDefaultPipeline(tx: Tx, locationId: string, createdBy: string | null, name = "Sales", stages = DEFAULT_SALES_STAGES, position = 0) {
  const [p] = await tx.insert(pipelines).values({ locationId, name, position, createdBy }).returning();
  await tx.insert(pipelineStages).values(
    stages.map(([stage, probability], i) => ({ locationId, pipelineId: p!.id, name: stage, position: i, probability, createdBy })),
  );
  return p!;
}

export async function updateLocation(tx: Tx, actor: Actor, id: string, input: Partial<LocationInput>) {
  const before = await getLocation(tx, id);
  if (!before) throw new NotFoundError();
  const data = clean(input);
  const rows = await guard(tx.update(locations).set(data).where(eq(locations.id, id)).returning());
  // RLS hides rows the user can't update, so 0 rows means not allowed.
  if (rows.length === 0) throw new NotFoundError();
  await recordChange(tx, actor, {
    type: "location.updated",
    entity: "location",
    entityId: id,
    locationId: id,
    agencyId: before.agencyId,
    before,
    after: rows[0],
  });
  return rows[0]!;
}

export async function setLocationArchived(tx: Tx, actor: Actor, id: string, archived: boolean) {
  const before = await getLocation(tx, id);
  if (!before) throw new NotFoundError();
  const rows = await guard(
    tx.update(locations).set({ archivedAt: archived ? new Date() : null }).where(eq(locations.id, id)).returning(),
  );
  if (rows.length === 0) throw new NotFoundError();
  await recordChange(tx, actor, {
    type: archived ? "location.archived" : "location.unarchived",
    entity: "location",
    entityId: id,
    locationId: id,
    agencyId: before.agencyId,
    before,
    after: rows[0],
  });
  return rows[0]!;
}

/** Per-location counts for the agency dashboard. Run unpinned: RLS limits it to the user's locations. */
export async function locationStats(tx: Tx) {
  return tx.execute<{ id: string; name: string; archived: boolean; contacts: number; contacts_30d: number; pipelines: number; members: number }>(sql`
    select l.id, l.name, l.archived_at is not null as archived,
      (select count(*)::int from contacts c where c.location_id = l.id and c.deleted_at is null) as contacts,
      (select count(*)::int from contacts c where c.location_id = l.id and c.deleted_at is null and c.created_at > now() - interval '30 days') as contacts_30d,
      (select count(*)::int from pipelines p where p.location_id = l.id and p.deleted_at is null) as pipelines,
      (select count(*)::int from memberships m where m.location_id = l.id and m.deleted_at is null) as members
    from locations l
    where l.deleted_at is null
    order by l.name`);
}
