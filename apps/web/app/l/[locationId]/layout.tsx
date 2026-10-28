import { AppShell } from "@/components/shell/app-shell";
import { LOCATION_NAV } from "@/components/shell/nav";
import { getLocationContext } from "@/lib/context";

export default async function LocationLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locationId: string }> }) {
  const { locationId } = await params;
  const ctx = await getLocationContext(locationId);
  const roleLabel = ctx.access.canAdmin ? "Admin" : ctx.access.canWrite ? "User" : "Read-only";
  return (
    <AppShell ctx={ctx} nav={LOCATION_NAV} base={`/l/${locationId}`} title={ctx.location.name} currentLocationId={locationId} roleLabel={`${roleLabel} · ${ctx.location.name}`}>
      {ctx.location.archivedAt ? (
        <div className="mb-4 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">This sub-account is archived.</div>
      ) : null}
      {children}
    </AppShell>
  );
}
