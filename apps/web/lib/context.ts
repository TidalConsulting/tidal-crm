import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { withTenant, type Tx } from "@tidal/db";
import { agencyAccess, listLocations, locationAccess } from "@tidal/core";
import { requireUser } from "./session";

/**
 * Everything the shell needs: the user, their agency role (if any) and every sub-account
 * they can reach. Loaded unpinned, so RLS limits the list to the user's own access.
 */
export const getAppContext = cache(async () => {
  const user = await requireUser();
  const { agency, locations } = await withTenant({ userId: user.id, locationId: null }, async (tx) => ({
    agency: await agencyAccess(tx, user.id),
    locations: await listLocations(tx),
  }));
  return { user, agency, locations };
});

export type AppContext = Awaited<ReturnType<typeof getAppContext>>;

/** Resolve /l/[locationId]: 404 unless the user can access it. */
export const getLocationContext = cache(async (locationId: string) => {
  const ctx = await getAppContext();
  const location = ctx.locations.find((l) => l.id === locationId);
  if (!location) notFound();
  const access = await withTenant({ userId: ctx.user.id, locationId }, (tx) => locationAccess(tx, locationId));
  return { ...ctx, location, access };
});

/** Run DB work as the signed-in user, pinned to one sub-account. */
export async function inLocation<T>(locationId: string, fn: (tx: Tx, userId: string) => Promise<T>) {
  const user = await requireUser();
  return withTenant({ userId: user.id, locationId }, (tx) => fn(tx, user.id));
}

/** Run DB work as the signed-in user across every sub-account they can access (agency view). */
export async function inAgency<T>(fn: (tx: Tx, userId: string) => Promise<T>) {
  const user = await requireUser();
  return withTenant({ userId: user.id, locationId: null }, (tx) => fn(tx, user.id));
}

/** Shared shape for server action results shown with <FormMessage>. */
export type ActionState = { error?: string; ok?: string } | null;

export function actionError(e: unknown): ActionState {
  const err = e as Error;
  if (["ValidationError", "ForbiddenError", "NotFoundError"].includes(err?.name)) return { error: err.message };
  console.error(e);
  return { error: "Something went wrong. Please try again." };
}
