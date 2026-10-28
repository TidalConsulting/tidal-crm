import { notFound } from "next/navigation";
import { ComingSoon } from "@/components/coming-soon";
import { AGENCY_NAV } from "@/components/shell/nav";
import { PageHeader } from "@/components/ui/card";

export default async function AgencyPlaceholder({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const item = AGENCY_NAV.find((n) => n.slug === section);
  if (!item) notFound();
  return (
    <>
      <PageHeader title={item.label} />
      <ComingSoon title={item.label} phase={item.phase} />
    </>
  );
}
