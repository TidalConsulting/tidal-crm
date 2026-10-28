"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { SHIPPED_PHASE } from "./shell/nav";

export function SettingsNav({ base, items }: { base: string; items: { slug: string; label: string; phase: number }[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Settings" className="flex gap-1 overflow-x-auto md:flex-col">
      {items.map((i) => {
        const href = `${base}/${i.slug}`;
        const active = pathname === href;
        return (
          <Link
            key={i.slug}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-sm whitespace-nowrap",
              active ? "bg-surface font-medium shadow-sm ring-1 ring-border" : "text-muted hover:bg-surface-2 hover:text-foreground",
            )}
          >
            {i.label}
            {i.phase > SHIPPED_PHASE ? <span className="text-[10px] text-muted">P{i.phase}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
