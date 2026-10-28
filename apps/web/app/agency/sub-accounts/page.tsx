import Link from "next/link";
import { locationStats, TIMEZONES } from "@tidal/core";
import { ActionForm } from "@/components/action-form";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { Table, Td, Th } from "@/components/ui/table";
import { getAppContext, inAgency } from "@/lib/context";
import { createSubAccount } from "../actions";

export const metadata = { title: "Sub-accounts" };

export default async function SubAccounts() {
  const { agency } = await getAppContext();
  const rows = await inAgency((tx) => locationStats(tx));
  const isAdmin = agency?.role === "agency_admin";
  return (
    <>
      <PageHeader title="Sub-accounts" description="One per portfolio company. Each has its own contacts, pipelines, inbox and settings." />
      <div className="grid gap-4 xl:grid-cols-[1fr_22rem]">
        <Card>
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th className="text-right">Contacts</Th>
                <Th className="text-right">Users</Th>
                <Th className="w-28" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-surface-2">
                  <Td>
                    <Link href={`/agency/sub-accounts/${r.id}`} className="font-medium hover:underline">{r.name}</Link>{" "}
                    {r.archived ? <Badge>Archived</Badge> : null}
                  </Td>
                  <Td className="text-right tabular-nums">{r.contacts}</Td>
                  <Td className="text-right tabular-nums">{r.members}</Td>
                  <Td className="text-right">
                    <Link href={`/l/${r.id}/dashboard`} className="text-xs text-primary hover:underline">Open →</Link>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
        {isAdmin ? (
          <Card className="self-start">
            <CardHeader title="New sub-account" description="Starts with a Sales pipeline and a default dashboard. Snapshot templates come in phase 4." />
            <ActionForm action={createSubAccount} submitLabel="Create sub-account" className="grid gap-3 p-4">
              <Field label="Company name" htmlFor="name">
                <Input id="name" name="name" required autoComplete="off" />
              </Field>
              <Field label="Legal name" htmlFor="legalName">
                <Input id="legalName" name="legalName" autoComplete="off" />
              </Field>
              <Field label="Time zone" htmlFor="timezone">
                <Select id="timezone" name="timezone" defaultValue="America/New_York">
                  {TIMEZONES.map((tz) => (
                    <option key={tz}>{tz}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Snapshot" htmlFor="snapshot" hint="Available in phase 4">
                <Select id="snapshot" name="snapshot" disabled>
                  <option>None</option>
                </Select>
              </Field>
            </ActionForm>
          </Card>
        ) : null}
      </div>
    </>
  );
}
