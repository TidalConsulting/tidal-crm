import { notFound } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { AGENCY_NAV } from "@/components/shell/nav";
import { getAppContext } from "@/lib/context";

export default async function AgencyLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAppContext();
  if (!ctx.agency) notFound();
  return (
    <AppShell ctx={ctx} nav={AGENCY_NAV} base="/agency" title="Tidal Consulting · Agency" currentLocationId={null}>
      {children}
    </AppShell>
  );
}
