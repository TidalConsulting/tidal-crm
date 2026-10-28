import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocation, locationMembers, ROLE_LABELS, TIMEZONES } from "@tidal/core";
import { ActionForm } from "@/components/action-form";
import { Button, buttonClass } from "@/components/ui/button";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { getAppContext, inAgency } from "@/lib/context";
import { formatDate } from "@/lib/utils";
import { setArchived, updateSubAccount } from "../../actions";

export default async function SubAccountDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { agency } = await getAppContext();
  const data = await inAgency(async (tx) => {
    const loc = await getLocation(tx, id);
    return loc ? { loc, members: await locationMembers(tx, id, loc.agencyId) } : null;
  });
  if (!data) notFound();
  const { loc, members } = data;
  const isAdmin = agency?.role === "agency_admin";

  return (
    <>
      <PageHeader
        title={loc.name}
        description={<>Created {formatDate(loc.createdAt, loc.timezone)} {loc.archivedAt ? <Badge tone="warning">Archived</Badge> : null}</>}
        actions={<Link className={buttonClass("secondary")} href={`/l/${loc.id}/dashboard`}>Open sub-account →</Link>}
      />
      <div className="grid gap-4 xl:grid-cols-[1fr_22rem]">
        <Card>
          <CardHeader title="Details" />
          <ActionForm action={updateSubAccount.bind(null, loc.id)} submitLabel="Save" disabled={!isAdmin} className="grid gap-4 p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Display name" htmlFor="name">
                <Input id="name" name="name" defaultValue={loc.name} required />
              </Field>
              <Field label="Legal name" htmlFor="legalName">
                <Input id="legalName" name="legalName" defaultValue={loc.legalName ?? ""} />
              </Field>
              <Field label="Time zone" htmlFor="timezone">
                <Select id="timezone" name="timezone" defaultValue={loc.timezone}>
                  {TIMEZONES.map((tz) => (
                    <option key={tz}>{tz}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Phone" htmlFor="phoneNumber" hint="E.164, e.g. +14075550100">
                <Input id="phoneNumber" name="phoneNumber" defaultValue={loc.phoneNumber ?? ""} />
              </Field>
              <Field label="Email" htmlFor="email">
                <Input id="email" name="email" type="email" defaultValue={loc.email ?? ""} />
              </Field>
            </div>
          </ActionForm>
        </Card>
        <div className="grid gap-4 self-start">
          <Card>
            <CardHeader title="Users" description={<Link className="text-primary hover:underline" href="/agency/team">Manage on the Team page</Link>} />
            <ul className="divide-y divide-border">
              {members.map((m) => (
                <li key={m.membershipId} className="flex items-center justify-between gap-2 px-4 py-2 text-sm">
                  <span className="truncate">{m.name ?? m.email}</span>
                  <span className="text-xs whitespace-nowrap text-muted">{ROLE_LABELS[m.role]}</span>
                </li>
              ))}
            </ul>
          </Card>
          {isAdmin ? (
            <Card>
              <CardHeader title={loc.archivedAt ? "Restore" : "Archive"} description={loc.archivedAt ? "Make this sub-account active again." : "Hides it from the default landing. Data is kept."} />
              <form action={setArchived.bind(null, loc.id, !loc.archivedAt)} className="p-4">
                <Button type="submit" variant={loc.archivedAt ? "secondary" : "danger"}>
                  {loc.archivedAt ? "Restore sub-account" : "Archive sub-account"}
                </Button>
              </form>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
