import { redirect } from "next/navigation";

export default async function SettingsIndex({ params }: { params: Promise<{ locationId: string }> }) {
  redirect(`/l/${(await params).locationId}/settings/business-profile`);
}
