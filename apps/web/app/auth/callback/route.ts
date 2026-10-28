import { NextResponse, type NextRequest } from "next/server";
import { allowedDomains } from "@/lib/auth-config";
import { supabaseServer } from "@/lib/supabase";

/** Google OAuth (via Supabase Auth) lands here with ?code=…; exchange it for a session. */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (!code) return NextResponse.redirect(new URL("/login?error=oauth", request.url));
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user?.email) return NextResponse.redirect(new URL("/login?error=oauth", request.url));
  const domains = allowedDomains();
  if (domains.length && !domains.includes(data.user.email.split("@")[1]!.toLowerCase())) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/login?error=domain", request.url));
  }
  return NextResponse.redirect(new URL("/", request.url));
}
