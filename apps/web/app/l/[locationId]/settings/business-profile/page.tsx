import { ActionForm } from "@/components/action-form";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { getLocation, TIMEZONES } from "@tidal/core";
import { getLocationContext, inLocation } from "@/lib/context";
import { saveBusinessProfile } from "../actions";

export default async function BusinessProfile({ params }: { params: Promise<{ locationId: string }> }) {
  const { locationId } = await params;
  const { access } = await getLocationContext(locationId);
  // The context only carries the switcher fields; read the full row.
  const loc = (await inLocation(locationId, (tx) => getLocation(tx, locationId)))!;

  return (
    <Card>
      <CardHeader title="Business profile" description={access.canAdmin ? "Shown on outbound messages, booking pages and invoices." : "Only admins can edit the business profile."} />
      <ActionForm action={saveBusinessProfile.bind(null, locationId)} submitLabel="Save" disabled={!access.canAdmin} className="grid gap-4 p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Display name" htmlFor="name">
            <Input id="name" name="name" defaultValue={loc.name} required />
          </Field>
          <Field label="Legal name" htmlFor="legalName">
            <Input id="legalName" name="legalName" defaultValue={loc.legalName ?? ""} />
          </Field>
          <Field label="Phone" htmlFor="phoneNumber" hint="E.164 format, e.g. +14075550100">
            <Input id="phoneNumber" name="phoneNumber" defaultValue={loc.phoneNumber ?? ""} placeholder="+14075550100" />
          </Field>
          <Field label="Email" htmlFor="email">
            <Input id="email" name="email" type="email" defaultValue={loc.email ?? ""} />
          </Field>
          <Field label="Website" htmlFor="website">
            <Input id="website" name="website" type="url" defaultValue={loc.website ?? ""} placeholder="https://" />
          </Field>
          <Field label="Time zone" htmlFor="timezone" hint="Times are stored in UTC and shown in this zone.">
            <Select id="timezone" name="timezone" defaultValue={loc.timezone}>
              {TIMEZONES.map((tz) => (
                <option key={tz}>{tz}</option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Address" htmlFor="address">
          <Input id="address" name="address" defaultValue={loc.address ?? ""} />
        </Field>
      </ActionForm>
    </Card>
  );
}
