"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3, Building2, CalendarDays, Copy, CreditCard, Globe, KanbanSquare, LayoutDashboard,
  Megaphone, MessagesSquare, Settings, UserCog, Users, Workflow, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SHIPPED_PHASE, type NavItem } from "./nav";

const ICONS: Record<string, LucideIcon> = {
  BarChart3, Building2, CalendarDays, Copy, CreditCard, Globe, KanbanSquare, LayoutDashboard,
  Megaphone, MessagesSquare, Settings, UserCog, Users, Workflow,
};

export function Sidebar({ items, base, title }: { items: NavItem[]; base: string; title: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-12 items-center gap-2 px-4">
        <span className="grid h-6 w-6 place-items-center rounded bg-primary text-[11px] font-bold text-primary-foreground">T</span>
        <span className="text-sm font-semibold text-white">Tidal OS</span>
      </div>
      <div className="px-4 pb-2 text-[11px] font-medium tracking-wider text-sidebar-foreground/60 uppercase">{title}</div>
      <ul className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-4">
        {items.map((item) => {
          const href = item.slug ? `${base}/${item.slug}` : base;
          const active = item.slug ? pathname === href || pathname.startsWith(`${href}/`) : pathname === base;
          const Icon = ICONS[item.icon] ?? LayoutDashboard;
          const shipped = item.phase <= SHIPPED_PHASE;
          return (
            <li key={item.label}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition",
                  active ? "bg-sidebar-active text-white" : "hover:bg-sidebar-active/60 hover:text-white",
                  !shipped && !active && "opacity-55",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                <span className="flex-1 truncate">{item.label}</span>
                {!shipped ? <span className="text-[10px] text-sidebar-foreground/60">P{item.phase}</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
