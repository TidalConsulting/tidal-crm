import Link from "next/link";
import { and, count, eq, gt, isNull, sql } from "drizzle-orm";
import { schema } from "@tidal/db";
import { locationMembers } from "@tidal/core";
import { Card, CardHeader, PageHeader } from "@/components/ui/card";
import { getLocationContext, inLocation } from "@/lib/context";
import { formatDate } from "@/lib/utils";

const { contacts, pipelines, pipelineStages } = schema;

export default async function Dashboard({ params }: { params: Promise<{ locationId: string }> }) {
  const { locationId } = await params;
  const { location } = await getLocationContext(locationId);
  const data = await inLocation(locationId, async (tx) => {
    const live = and(eq(contacts.locationId, locationId), isNull(contacts.deletedAt));
    const [total] = await tx.select({ n: count() }).from(contacts).where(live);
    const [recent] = await tx.select({ n: count() }).from(contacts).where(and(live, gt(contacts.createdAt, sql`now() - interval '30 days'`)));
    const bySource = await tx
      .select({ source: contacts.source, n: count() })
      .from(contacts)
      .where(and(live, gt(contacts.createdAt, sql`now() - interval '30 days'`)))
      .groupBy(contacts.source)
      .orderBy(sql`count(*) desc`);
    const pipes = await tx
      .select({ id: pipelines.id, name: pipelines.name, stages: count(pipelineStages.id) })
      .from(pipelines)
      .leftJoin(pipelineStages, and(eq(pipelineStages.pipelineId, pipelines.id), isNull(pipelineStages.deletedAt)))
      .where(and(eq(pipelines.locationId, locationId), isNull(pipelines.deletedAt)))
      .groupBy(pipelines.id)
      .orderBy(pipelines.position);
    const team = await locationMembers(tx, locationId, location.agencyId);
    return { total: total!.n, recent: recent!.n, bySource, pipes, team: team.length };
  });
  const max = Math.max(1, ...data.bySource.map((s) => s.n));

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`${location.name} · ${location.timezone} · today is ${formatDate(new Date(), location.timezone)}`}
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Contacts" value={data.total} href={`/l/${locationId}/contacts`} />
        <Stat label="New leads (30 days)" value={data.recent} />
        <Stat label="Pipelines" value={data.pipes.length} />
        <Stat label="Team members" value={data.team} href={`/l/${locationId}/settings/users`} />
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader title="Leads by source" description="Last 30 days" />
          <ul className="space-y-2 p-4">
            {data.bySource.map((s) => (
              <li key={s.source ?? "none"} className="grid grid-cols-[9rem_1fr_2.5rem] items-center gap-2 text-sm">
                <span className="truncate text-muted">{s.source ?? "Unknown"}</span>
                <span className="h-2 rounded bg-surface-2">
                  <span className="block h-2 rounded bg-primary" style={{ width: `${(s.n / max) * 100}%` }} />
                </span>
                <span className="text-right tabular-nums">{s.n}</span>
              </li>
            ))}
            {data.bySource.length === 0 ? <li className="text-sm text-muted">No new leads in the last 30 days.</li> : null}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Pipelines" description="Kanban boards arrive in phase 2" />
          <ul className="divide-y divide-border">
            {data.pipes.map((p) => (
              <li key={p.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span>{p.name}</span>
                <span className="text-muted">{p.stages} stages</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <p className="mt-4 text-xs text-muted">
        This is the phase 1 dashboard. The customizable widget dashboard (SPEC §6, Dashboards) starts in phase 2.
      </p>
    </>
  );
}

function Stat({ label, value, href }: { label: string; value: number; href?: string }) {
  const body = (
    <Card className="p-4 transition hover:border-primary/40">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value.toLocaleString()}</div>
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}
