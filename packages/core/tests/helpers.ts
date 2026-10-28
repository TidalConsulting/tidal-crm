import "dotenv/config";
import { afterAll } from "vitest";
import { closeDb, getDb, withSystem, withTenant, type Tx } from "@tidal/db";
import { AGENCY_ID, locationId, userId } from "../src/scripts/seed";

export const url = process.env.TEST_DATABASE_URL!;
export const { db } = getDb(url);

afterAll(() => closeDb(url));

export const GOVPOINTE = locationId("GovPointe");
export const GAIA = locationId("Gaia Homes");
export const HONCHAR_AUTO = locationId("Honchar Auto");
export const HONCHAR_REMODELING = locationId("Honchar Remodeling");
export { AGENCY_ID, userId };

export const U = {
  admin: userId("admin"),
  viewer: userId("viewer"),
  govpointe: userId("govpointe"),
  govpointeAdmin: userId("govpointe-admin"),
  gaia: userId("gaia"),
  honchar: userId("honchar"),
};

/** Run as a user, pinned to a location (or unpinned with null). */
export function as<T>(user: string, location: string | null, fn: (tx: Tx) => Promise<T>) {
  return withTenant({ userId: user, locationId: location }, fn, db);
}

export function system<T>(fn: (tx: Tx) => Promise<T>) {
  return withSystem(fn, db);
}

/** Expect a query to be rejected by Postgres permissions/RLS (SQLSTATE 42501). */
export async function expectDenied(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    const err = e as { code?: string; cause?: { code?: string } };
    const code = err.code ?? err.cause?.code;
    if (code === "42501") return;
    throw new Error(`expected permission denial (42501), got ${code}: ${(e as Error).message}`);
  }
  throw new Error("expected permission denial, but the query succeeded");
}
