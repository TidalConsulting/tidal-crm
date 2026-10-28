import { sql } from "drizzle-orm";
import { getDb, type DB, type Tx } from "./client";

export type Actor =
  | { type: "user"; userId: string }
  | { type: "system"; name: string };

export type TenantContext = {
  userId: string;
  /** The pinned sub-account. null = agency view (every location the user can access). */
  locationId: string | null;
};

/**
 * Run `fn` as the signed-in user, inside a transaction, with RLS enforced.
 *
 * All request-path DB access goes through here. The connection drops to the
 * non-owner `app_user` role, so Postgres policies decide what is visible,
 * whatever the app code asks for.
 */
export async function withTenant<T>(ctx: TenantContext, fn: (tx: Tx) => Promise<T>, db: DB = getDb().db): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local role app_user`);
    await tx.execute(sql`select set_config('app.user_id', ${ctx.userId}, true), set_config('app.location_id', ${ctx.locationId ?? ""}, true)`);
    return fn(tx);
  });
}

/**
 * Run `fn` as trusted system code (seed, worker, webhooks, first-login provisioning).
 * Stays on the owner role, so RLS is bypassed: always scope queries by location_id yourself.
 */
export async function withSystem<T>(fn: (tx: Tx) => Promise<T>, db: DB = getDb().db): Promise<T> {
  return db.transaction(fn);
}
