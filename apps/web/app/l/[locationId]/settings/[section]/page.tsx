import { notFound } from "next/navigation";
import { ComingSoon } from "@/components/coming-soon";
import { SETTINGS_NAV } from "@/components/shell/nav";
import { getLocationContext } from "@/lib/context";

export default async function SettingsPlaceholder({ params }: { params: Promise<{ locationId: string; section: string }> }) {
  const { locationId, section } = await params;
  const item = SETTINGS_NAV.find((s) => s.slug === section);
  if (!item) notFound();
  const { location } = await getLocationContext(locationId);
  return <ComingSoon title={item.label} phase={item.phase} context={location.name} />;
}
