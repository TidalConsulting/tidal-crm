import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { listUsersForDevLogin } from "@tidal/core";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { authMode } from "@/lib/auth-config";
import { getSessionUser } from "@/lib/session";
import { devSignIn, googleSignIn } from "./actions";

export const metadata: Metadata = { title: "Sign in" };

const errors: Record<string, string> = {
  oauth: "Google sign-in failed. Try again.",
  domain: "That Google account isn't allowed. Use your company account.",
  "unknown-user": "That user no longer exists.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getSessionUser()) redirect("/");
  const { error } = await searchParams;
  const mode = authMode();
  const users = mode === "dev" ? await listUsersForDevLogin() : [];

  return (
    <main className="grid min-h-dvh place-items-center bg-background p-4">
      <Card className="w-full max-w-sm p-6">
        <div className="mb-5">
          <div className="text-xs font-semibold tracking-widest text-primary uppercase">Tidal OS</div>
          <h1 className="mt-1 text-lg font-semibold">Sign in</h1>
        </div>
        {error ? <p className="mb-4 text-sm text-danger">{errors[error] ?? "Sign-in failed."}</p> : null}
        {mode === "supabase" ? (
          <form action={googleSignIn}>
            <Button type="submit" className="w-full justify-center">
              Continue with Google
            </Button>
          </form>
        ) : (
          <>
            <p className="mb-3 text-xs text-muted">
              Local development mode. Pick a seeded user. Google sign-in is enabled with <code>AUTH_MODE=supabase</code>.
            </p>
            <div className="grid gap-1.5">
              {users.map((u) => (
                <form key={u.id} action={devSignIn}>
                  <input type="hidden" name="userId" value={u.id} />
                  <Button type="submit" variant="secondary" className="h-auto w-full flex-col items-start gap-0 py-1.5 text-left">
                    <span>{u.name ?? u.email}</span>
                    <span className="text-xs font-normal text-muted">{u.email}</span>
                  </Button>
                </form>
              ))}
              {users.length === 0 ? <p className="text-sm text-muted">No users yet. Run <code>pnpm db:seed</code>.</p> : null}
            </div>
          </>
        )}
      </Card>
    </main>
  );
}
