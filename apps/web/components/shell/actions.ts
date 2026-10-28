"use server";

import { cookies } from "next/headers";
import { setLastLocation } from "@tidal/core";
import { inLocation } from "@/lib/context";

export async function rememberLocation(locationId: string) {
  // RLS: the update only lands on the user's own row, and the pin fails for locations they can't access.
  await inLocation(locationId, (tx, userId) => setLastLocation(tx, userId, locationId));
}

export async function setTheme(theme: "light" | "dark" | "system") {
  const store = await cookies();
  if (theme === "system") store.delete("theme");
  else store.set("theme", theme, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
}
