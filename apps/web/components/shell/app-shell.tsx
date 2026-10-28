import { Bell, Plus, Search } from "lucide-react";
import type { AppContext } from "@/lib/context";
import { ROLE_LABELS } from "@tidal/core";
import { Sidebar } from "./sidebar";
import { Switcher } from "./switcher";
import { UserMenu } from "./user-menu";
import type { NavItem } from "./nav";

/** GHL-style frame (SPEC §8): fixed left sidebar, top bar with switcher, content area. */
export function AppShell({
  ctx,
  nav,
  base,
  title,
  currentLocationId,
  roleLabel,
  children,
}: {
  ctx: AppContext;
  nav: NavItem[];
  base: string;
  title: string;
  currentLocationId: string | null;
  roleLabel?: string;
  children: React.ReactNode;
}) {
  const locations = ctx.locations.map((l) => ({ id: l.id, name: l.name, archived: !!l.archivedAt }));
  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 md:block">
        <Sidebar items={nav} base={base} title={title} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-12 items-center gap-2 border-b border-border bg-surface px-3">
          <Switcher locations={locations} currentId={currentLocationId} showAgency={!!ctx.agency} />
          <div className="mx-2 hidden max-w-md flex-1 lg:block">
            <div
              className="flex h-8 items-center gap-2 rounded-md border border-border bg-surface-2 px-2.5 text-sm text-muted"
              title="Global search arrives with contacts and opportunities in phase 2"
            >
              <Search className="h-3.5 w-3.5" aria-hidden />
              Search contacts, opportunities… <span className="ml-auto text-[10px]">Phase 2</span>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <button type="button" disabled title="Quick add arrives in phase 2" className="grid h-8 w-8 place-items-center rounded-md text-muted disabled:opacity-50" aria-label="Quick add">
              <Plus className="h-4 w-4" />
            </button>
            <button type="button" disabled title="Notifications arrive in phase 3" className="grid h-8 w-8 place-items-center rounded-md text-muted disabled:opacity-50" aria-label="Notifications">
              <Bell className="h-4 w-4" />
            </button>
            <UserMenu
              name={ctx.user.name}
              email={ctx.user.email}
              role={roleLabel ?? (ctx.agency ? ROLE_LABELS[ctx.agency.role] : "")}
            />
          </div>
        </header>
        <nav aria-label="Modules" className="flex gap-1 overflow-x-auto border-b border-border bg-surface px-2 py-1 md:hidden">
          {nav.map((n) => (
            <a key={n.label} href={n.slug ? `${base}/${n.slug}` : base} className="rounded px-2 py-1 text-xs whitespace-nowrap hover:bg-surface-2">
              {n.label}
            </a>
          ))}
        </nav>
        <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
