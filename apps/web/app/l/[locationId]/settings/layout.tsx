import { SettingsNav } from "@/components/settings-nav";
import { PageHeader } from "@/components/ui/card";
import { SETTINGS_NAV } from "@/components/shell/nav";

export default async function SettingsLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locationId: string }> }) {
  const { locationId } = await params;
  return (
    <>
      <PageHeader title="Settings" />
      <div className="grid gap-4 md:grid-cols-[12rem_1fr]">
        <SettingsNav base={`/l/${locationId}/settings`} items={SETTINGS_NAV} />
        <div className="min-w-0">{children}</div>
      </div>
    </>
  );
}
