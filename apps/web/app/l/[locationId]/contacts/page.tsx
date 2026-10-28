import Link from "next/link";
import { listContacts } from "@tidal/core";
import { Card, PageHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/form";
import { buttonClass } from "@/components/ui/button";
import { Table, Td, Th } from "@/components/ui/table";
import { getLocationContext, inLocation } from "@/lib/context";
import { formatDate, formatPhone } from "@/lib/utils";

export default async function ContactsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locationId: string }>;
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { locationId } = await params;
  const { q, page } = await searchParams;
  const { location } = await getLocationContext(locationId);
  const result = await inLocation(locationId, (tx) => listContacts(tx, { locationId, q, page: Number(page) || 1 }));
  const href = (p: number) => `?${new URLSearchParams({ ...(q ? { q } : {}), page: String(p) })}`;

  return (
    <>
      <PageHeader title="Contacts" description={`${result.total.toLocaleString()} contacts in ${location.name}. The full table view, import and editing arrive in phase 2.`} />
      <Card>
        <form className="flex gap-2 border-b border-border p-3" role="search">
          <Input name="q" defaultValue={q} placeholder="Search name, email or phone" aria-label="Search contacts" className="max-w-xs" />
          <button className={buttonClass("secondary")} type="submit">Search</button>
          {q ? <Link href="?" className={buttonClass("ghost")}>Clear</Link> : null}
        </form>
        <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Email</Th>
              <Th>Phone</Th>
              <Th>Source</Th>
              <Th>Created</Th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((c) => (
              <tr key={c.id} className="hover:bg-surface-2">
                <Td className="font-medium">{[c.firstName, c.lastName].filter(Boolean).join(" ") || "—"}</Td>
                <Td className="text-muted">{c.email ?? "—"}</Td>
                <Td className="text-muted tabular-nums">{formatPhone(c.phone)}</Td>
                <Td className="text-muted">{c.source ?? "—"}</Td>
                <Td className="text-muted">{formatDate(c.createdAt, location.timezone)}</Td>
              </tr>
            ))}
            {result.rows.length === 0 ? (
              <tr>
                <Td colSpan={5} className="py-8 text-center text-muted">No contacts match.</Td>
              </tr>
            ) : null}
          </tbody>
        </Table>
        <div className="flex items-center justify-between p-3 text-sm text-muted">
          <span>Page {result.page} of {result.pages}</span>
          <div className="flex gap-1">
            {result.page > 1 ? <Link className={buttonClass("secondary", "sm")} href={href(result.page - 1)}>Previous</Link> : null}
            {result.page < result.pages ? <Link className={buttonClass("secondary", "sm")} href={href(result.page + 1)}>Next</Link> : null}
          </div>
        </div>
      </Card>
    </>
  );
}
