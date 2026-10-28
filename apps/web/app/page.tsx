import { redirect } from "next/navigation";
import { getAppContext } from "@/lib/context";

/** Land on the last-used sub-account (SPEC §6), else the first one, else the agency view. */
export default async function Home() {
  const { user, agency, locations } = await getAppContext();
  const active = locations.filter((l) => !l.archivedAt);
  const last = active.find((l) => l.id === user.lastLocationId);
  const target = last ?? active[0];
  if (target) redirect(`/l/${target.id}/dashboard`);
  if (agency) redirect("/agency");
  return (
    <main className="grid min-h-dvh place-items-center p-6 text-center">
      <div>
        <h1 className="text-lg font-semibold">No sub-accounts yet</h1>
        <p className="mt-1 text-sm text-muted">Ask a Tidal agency admin to give you access to a sub-account.</p>
      </div>
    </main>
  );
}
