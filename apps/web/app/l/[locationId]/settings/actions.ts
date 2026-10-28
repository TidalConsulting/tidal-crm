"use server";

import { revalidatePath } from "next/cache";
import { addMember, removeMember, updateLocation, type Role } from "@tidal/core";
import { actionError, inLocation, type ActionState } from "@/lib/context";

const str = (f: FormData, k: string) => (f.has(k) ? String(f.get(k) ?? "") : undefined);

export async function saveBusinessProfile(locationId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    await inLocation(locationId, (tx, userId) =>
      updateLocation(tx, { type: "user", userId }, locationId, {
        name: str(form, "name"),
        legalName: str(form, "legalName"),
        timezone: str(form, "timezone"),
        phoneNumber: str(form, "phoneNumber"),
        email: str(form, "email"),
        website: str(form, "website"),
        address: str(form, "address"),
      }),
    );
    revalidatePath(`/l/${locationId}`, "layout");
    return { ok: "Saved" };
  } catch (e) {
    return actionError(e);
  }
}

export async function addLocationMember(locationId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const role = String(form.get("role")) as Role;
    await inLocation(locationId, (tx, userId) =>
      addMember(tx, { type: "user", userId }, { email: String(form.get("email") ?? ""), name: str(form, "name"), role, locationId }),
    );
    revalidatePath(`/l/${locationId}/settings/users`);
    return { ok: "Access granted. They can sign in with Google using that email." };
  } catch (e) {
    return actionError(e);
  }
}

export async function removeLocationMember(locationId: string, membershipId: string) {
  await inLocation(locationId, (tx, userId) => removeMember(tx, { type: "user", userId }, membershipId));
  revalidatePath(`/l/${locationId}/settings/users`);
}
