import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { jwtVerify, SignJWT } from "jose";
import { getUserById, provisionUser } from "@tidal/core";
import { allowedDomains, authMode, SESSION_COOKIE } from "./auth-config";
import { supabaseServer } from "./supabase";

const secret = () => {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set to at least 32 characters");
  return new TextEncoder().encode(s);
};

/** Dev mode: sign a session cookie for a seeded user. */
export async function startDevSession(userId: string) {
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret());
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function endSession() {
  if (authMode() === "supabase") await (await supabaseServer()).auth.signOut();
  (await cookies()).delete(SESSION_COOKIE);
}

/** The signed-in user, or null. Cached per request. */
export const getSessionUser = cache(async () => {
  if (authMode() === "dev") {
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    if (!token) return null;
    try {
      const { payload } = await jwtVerify(token, secret());
      return payload.sub ? await getUserById(payload.sub) : null;
    } catch {
      return null;
    }
  }

  const { data } = await (await supabaseServer()).auth.getUser();
  const au = data.user;
  if (!au?.email) return null;
  const domains = allowedDomains();
  if (domains.length && !domains.includes(au.email.split("@")[1]!.toLowerCase())) return null;
  return provisionUser({
    id: au.id,
    email: au.email,
    name: (au.user_metadata?.full_name as string | undefined) ?? null,
    avatarUrl: (au.user_metadata?.avatar_url as string | undefined) ?? null,
  });
});

export async function requireUser() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}
