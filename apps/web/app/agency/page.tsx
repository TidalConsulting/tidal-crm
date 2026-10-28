import Link from "next/link";
import { locationStats } from "@tidal/core";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui/card";
import { Table, Td, Th } from "@/components/ui/table";
import { inAgency } from "@/lib/context";

export const metadata = { title: "Agency dashboard" };

export default async function AgencyDashboard() {
  // Unpinned: RLS returns every sub-account this user can reach.
  const rows = await inAgency((tx) => locationStats(tx));
  const totals = rows.reduce(
    (t, r) => ({ contacts: t.contacts + r.contacts, recent: t.recent + r.contacts_30d }),
    { contacts: 0, recent: 0 },
  );
  return (
    <>
      <PageHeader title="Agency dashboard" description="Roll-up across every sub-account. Appointments, pipeline value and won revenue are added as those modules ship." />
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <div className="text-xs text-muted">Sub-accounts</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{rows.filter((r) => !r.archived).length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted">Contacts</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{totals.contacts.toLocaleString()}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted">New leads (30 days)</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{totals.recent.toLocaleString()}</div>
        </Card>
      </div>
      <Card className="mt-3">
        <CardHeader title="By sub-account" />
        <Table>
          <thead>
            <tr>
              <Th>Sub-account</Th>
              <Th className="text-right">Contacts</Th>
              <Th className="text-right">New leads (30d)</Th>
              <Th className="text-right">Pipelines</Th>
              <Th className="text-right">Users</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-surface-2">
                <Td>
                  <Link href={`/l/${r.id}/dashboard`} className="font-medium hover:underline">{r.name}</Link>{" "}
                  {r.archived ? <Badge>Archived</Badge> : null}
                </Td>
                <Td className="text-right tabular-nums">{r.contacts}</Td>
                <Td className="text-right tabular-nums">{r.contacts_30d}</Td>
                <Td className="text-right tabular-nums">{r.pipelines}</Td>
                <Td className="text-right tabular-nums">{r.members}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
