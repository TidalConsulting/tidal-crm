import { notFound } from "next/navigation";
import { ComingSoon } from "@/components/coming-soon";
import { LOCATION_NAV } from "@/components/shell/nav";
import { PageHeader } from "@/components/ui/card";
import { getLocationContext } from "@/lib/context";

/** Placeholder for modules that ship in later phases (they still switch with the sub-account). */
export default async function ModulePlaceholder({ params }: { params: Promise<{ locationId: string; section: string }> }) {
  const { locationId, section } = await params;
  const item = LOCATION_NAV.find((n) => n.slug === section);
  if (!item) notFound();
  const { location } = await getLocationContext(locationId);
  return (
    <>
      <PageHeader title={item.label} description={location.name} />
      <ComingSoon title={item.label} phase={item.phase} context={location.name} tabs={item.tabs} />
    </>
  );
}
