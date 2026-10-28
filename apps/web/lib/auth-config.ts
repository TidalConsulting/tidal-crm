export type AuthMode = "dev" | "supabase";

export const SESSION_COOKIE = "tidal_session";

export function authMode(): AuthMode {
  const mode = process.env.AUTH_MODE === "supabase" ? "supabase" : "dev";
  if (mode === "dev" && process.env.NODE_ENV === "production" && process.env.ALLOW_DEV_AUTH !== "1") {
    throw new Error("AUTH_MODE=dev is refused in production. Set AUTH_MODE=supabase.");
  }
  return mode;
}

export function allowedDomains() {
  return (process.env.ALLOWED_EMAIL_DOMAINS ?? "")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
}
