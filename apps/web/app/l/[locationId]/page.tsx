import { redirect } from "next/navigation";

export default async function LocationIndex({ params }: { params: Promise<{ locationId: string }> }) {
  redirect(`/l/${(await params).locationId}/dashboard`);
}
