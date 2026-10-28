"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { addMember, changeRole, createLocation, removeMember, setLocationArchived, updateAgency, updateLocation, type Role } from "@tidal/core";
import { actionError, getAppContext, inAgency, type ActionState } from "@/lib/context";

async function agencyId() {
  const { agency } = await getAppContext();
  if (!agency) throw new Error("Not an agency member");
  return agency.agencyId;
}

const str = (f: FormData, k: string) => (f.has(k) ? String(f.get(k) ?? "") : undefined);

export async function createSubAccount(_prev: ActionState, form: FormData): Promise<ActionState> {
  let id: string;
  try {
    const agency = await agencyId();
    const loc = await inAgency((tx, userId) =>
      createLocation(tx, { type: "user", userId }, agency, {
        name: String(form.get("name") ?? ""),
        legalName: str(form, "legalName"),
        timezone: str(form, "timezone"),
      }),
    );
    id = loc.id;
  } catch (e) {
    return actionError(e);
  }
  revalidatePath("/", "layout");
  redirect(`/agency/sub-accounts/${id}`);
}

export async function updateSubAccount(id: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    await inAgency((tx, userId) =>
      updateLocation(tx, { type: "user", userId }, id, {
        name: str(form, "name"),
        legalName: str(form, "legalName"),
        timezone: str(form, "timezone"),
        phoneNumber: str(form, "phoneNumber"),
        email: str(form, "email"),
      }),
    );
    revalidatePath("/", "layout");
    return { ok: "Saved" };
  } catch (e) {
    return actionError(e);
  }
}

export async function setArchived(id: string, archived: boolean) {
  await inAgency((tx, userId) => setLocationArchived(tx, { type: "user", userId }, id, archived));
  revalidatePath("/", "layout");
}

export async function inviteMember(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const role = String(form.get("role")) as Role;
    const scope = String(form.get("scope") ?? "agency");
    const agency = await agencyId();
    await inAgency((tx, userId) =>
      addMember(tx, { type: "user", userId }, {
        email: String(form.get("email") ?? ""),
        name: str(form, "name"),
        role,
        ...(scope === "agency" ? { agencyId: agency } : { locationId: scope }),
      }),
    );
    revalidatePath("/agency/team");
    return { ok: "Access granted. They can sign in with Google using that email." };
  } catch (e) {
    return actionError(e);
  }
}

export async function updateMemberRole(membershipId: string, form: FormData) {
  await inAgency((tx, userId) => changeRole(tx, { type: "user", userId }, membershipId, String(form.get("role")) as Role));
  revalidatePath("/agency/team");
}

export async function revokeMember(membershipId: string) {
  await inAgency((tx, userId) => removeMember(tx, { type: "user", userId }, membershipId));
  revalidatePath("/agency/team");
}

export async function saveAgency(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const agency = await agencyId();
    await inAgency((tx, userId) => updateAgency(tx, { type: "user", userId }, agency, { name: String(form.get("name") ?? "") }));
    revalidatePath("/agency", "layout");
    return { ok: "Saved" };
  } catch (e) {
    return actionError(e);
  }
}
