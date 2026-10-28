import { getAgency } from "@tidal/core";
import { ActionForm } from "@/components/action-form";
import { Card, CardHeader, PageHeader } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { getAppContext, inAgency } from "@/lib/context";
import { saveAgency } from "../actions";

export const metadata = { title: "Agency settings" };

export default async function AgencySettings() {
  const { agency } = await getAppContext();
  const row = await inAgency((tx) => getAgency(tx, agency!.agencyId));
  return (
    <>
      <PageHeader title="Agency settings" />
      <Card className="max-w-xl">
        <CardHeader title="Agency" />
        <ActionForm action={saveAgency} submitLabel="Save" disabled={agency?.role !== "agency_admin"} className="grid gap-4 p-4">
          <Field label="Name" htmlFor="name">
            <Input id="name" name="name" defaultValue={row?.name} required />
          </Field>
        </ActionForm>
      </Card>
    </>
  );
}
