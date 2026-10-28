"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getUserById } from "@tidal/core";
import { authMode } from "@/lib/auth-config";
import { endSession, startDevSession } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase";

export async function devSignIn(formData: FormData) {
  if (authMode() !== "dev") throw new Error("Dev sign-in is disabled");
  const user = await getUserById(String(formData.get("userId")));
  if (!user) redirect("/login?error=unknown-user");
  await startDevSession(user.id);
  redirect("/");
}

export async function googleSignIn() {
  const origin = (await headers()).get("origin") ?? process.env.APP_URL ?? "http://localhost:3000";
  const { data, error } = await (await supabaseServer()).auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${origin}/auth/callback`, queryParams: { prompt: "select_account" } },
  });
  if (error || !data.url) redirect("/login?error=oauth");
  redirect(data.url);
}

export async function signOut() {
  await endSession();
  redirect("/login");
}
