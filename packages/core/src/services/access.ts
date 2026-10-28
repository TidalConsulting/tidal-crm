import { sql } from "drizzle-orm";
import type { Tx } from "@tidal/db";

export type Access = {
  /** The user can read the pinned location (always true if they got this far). */
  canRead: boolean;
  canWrite: boolean;
  canAdmin: boolean;
};

/** What the current user may do in the pinned location. Asks the same SQL functions the RLS policies use. */
export async function locationAccess(tx: Tx, locationId: string): Promise<Access> {
  const rows = await tx.execute<{ r: boolean; w: boolean; a: boolean }>(sql`
    select ${locationId}::uuid = any(app.location_ids('read'))  as r,
           ${locationId}::uuid = any(app.location_ids('write')) as w,
           ${locationId}::uuid = any(app.location_ids('admin')) as a`);
  const row = rows[0]!;
  return { canRead: row.r, canWrite: row.w, canAdmin: row.a };
}

export type AgencyAccess = { agencyId: string; role: "agency_admin" | "agency_viewer" } | null;

/** The user's agency membership, if any. One agency in v1. */
export async function agencyAccess(tx: Tx, userId: string): Promise<AgencyAccess> {
  const rows = await tx.execute<{ agency_id: string; role: "agency_admin" | "agency_viewer" }>(sql`
    select agency_id, role from memberships
    where user_id = ${userId} and agency_id is not null and deleted_at is null
    order by case role when 'agency_admin' then 0 else 1 end
    limit 1`);
  const row = rows[0];
  return row ? { agencyId: row.agency_id, role: row.role } : null;
}
