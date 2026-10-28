import { and, eq, isNull, or, sql } from "drizzle-orm";
import { recordChange, schema, withSystem, type Actor, type Role, type Tx } from "@tidal/db";
import { ForbiddenError, guard, NotFoundError, ValidationError } from "../errors";

const { memberships, users, locations } = schema;

export const ROLE_LABELS: Record<Role, string> = {
  agency_admin: "Agency admin",
  agency_viewer: "Agency viewer (read-only)",
  location_admin: "Sub-account admin",
  user: "User",
};

export type Scope = { agencyId: string } | { locationId: string };

/** Everyone with a membership the current user can see, grouped per user. */
export async function listTeam(tx: Tx) {
  const rows = await tx
    .select({
      membershipId: memberships.id,
      userId: users.id,
      email: users.email,
      name: users.name,
      role: memberships.role,
      agencyId: memberships.agencyId,
      locationId: memberships.locationId,
      locationName: locations.name,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .leftJoin(locations, eq(locations.id, memberships.locationId))
    .where(isNull(memberships.deletedAt))
    .orderBy(users.email);
  const byUser = new Map<string, { userId: string; email: string; name: string | null; memberships: typeof rows }>();
  for (const r of rows) {
    const u = byUser.get(r.userId) ?? { userId: r.userId, email: r.email, name: r.name, memberships: [] };
    u.memberships.push(r);
    byUser.set(r.userId, u);
  }
  return [...byUser.values()];
}

async function canManage(tx: Tx, scope: Scope) {
  const [row] = await tx.execute<{ ok: boolean }>(
    "agencyId" in scope
      ? sql`select ${scope.agencyId}::uuid = any(app.agency_ids('admin')) as ok`
      : sql`select ${scope.locationId}::uuid = any(app.location_ids('admin')) as ok`,
  );
  return !!row?.ok;
}

/**
 * Give someone access to an agency or sub-account. If no user has that email yet, a users row is
 * created (trusted code), and it is linked to their Google login the first time they sign in.
 */
export async function addMember(tx: Tx, actor: Actor & { type: "user" }, input: { email: string; name?: string; role: Role } & Scope) {
  const email = input.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new ValidationError("Enter a valid email");
  const scope: Scope = "agencyId" in input && input.agencyId ? { agencyId: input.agencyId } : { locationId: (input as { locationId: string }).locationId };
  const agencyRole = input.role === "agency_admin" || input.role === "agency_viewer";
  if (agencyRole !== "agencyId" in scope) throw new ValidationError("That role doesn't fit that scope");
  // Check before creating the users row so a non-admin can't create users.
  if (!(await canManage(tx, scope))) throw new ForbiddenError();

  const userId = await withSystem(async (sys) => {
    const [existing] = await sys.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${email}`);
    if (existing) return existing.id;
    const [u] = await sys.insert(users).values({ email, name: input.name?.trim() || null, createdBy: actor.userId }).returning({ id: users.id });
    return u!.id;
  });

  const scopeFilter = "agencyId" in scope ? eq(memberships.agencyId, scope.agencyId) : eq(memberships.locationId, scope.locationId);
  const [current] = await tx
    .select()
    .from(memberships)
    .where(and(eq(memberships.userId, userId), scopeFilter, isNull(memberships.deletedAt)));
  if (current) return changeRole(tx, actor, current.id, input.role);

  const [m] = await guard(
    tx
      .insert(memberships)
      .values({ userId, role: input.role, createdBy: actor.userId, ...("agencyId" in scope ? { agencyId: scope.agencyId } : { locationId: scope.locationId }) })
      .returning(),
  );
  await recordChange(tx, actor, {
    type: "membership.created",
    entity: "membership",
    entityId: m!.id,
    locationId: m!.locationId,
    agencyId: m!.agencyId,
    after: { ...m, email },
  });
  return m!;
}

export async function changeRole(tx: Tx, actor: Actor, membershipId: string, role: Role) {
  const [before] = await tx.select().from(memberships).where(eq(memberships.id, membershipId));
  if (!before) throw new NotFoundError();
  const rows = await guard(tx.update(memberships).set({ role }).where(eq(memberships.id, membershipId)).returning());
  if (rows.length === 0) throw new ForbiddenError();
  await recordChange(tx, actor, {
    type: "membership.updated",
    entity: "membership",
    entityId: membershipId,
    locationId: before.locationId,
    agencyId: before.agencyId,
    before,
    after: rows[0],
  });
  return rows[0]!;
}

export async function removeMember(tx: Tx, actor: Actor & { type: "user" }, membershipId: string) {
  const [before] = await tx.select().from(memberships).where(eq(memberships.id, membershipId));
  if (!before) throw new NotFoundError();
  if (before.userId === actor.userId && before.agencyId) throw new ValidationError("You can't remove your own agency access");
  const rows = await guard(tx.update(memberships).set({ deletedAt: new Date() }).where(eq(memberships.id, membershipId)).returning());
  if (rows.length === 0) throw new ForbiddenError();
  await recordChange(tx, actor, {
    type: "membership.deleted",
    entity: "membership",
    entityId: membershipId,
    locationId: before.locationId,
    agencyId: before.agencyId,
    before,
  });
}

/** Members of one sub-account, including agency members who reach it through the agency. */
export async function locationMembers(tx: Tx, locationId: string, agencyId: string) {
  return tx
    .select({ userId: users.id, email: users.email, name: users.name, role: memberships.role, membershipId: memberships.id, viaAgency: sql<boolean>`${memberships.agencyId} is not null` })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(isNull(memberships.deletedAt), or(eq(memberships.locationId, locationId), eq(memberships.agencyId, agencyId))))
    .orderBy(users.email);
}
