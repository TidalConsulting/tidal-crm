"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Building2, Check, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { rememberLocation } from "./actions";

type Loc = { id: string; name: string; archived: boolean };

/** Top-bar sub-account switcher (SPEC §6/§8): searchable, keeps you on the same module. */
export function Switcher({ locations, currentId, showAgency }: { locations: Loc[]; currentId: string | null; showAgency: boolean }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [pending, start] = useTransition();
  const router = useRouter();
  const pathname = usePathname();
  const ref = useRef<HTMLDivElement>(null);

  const current = locations.find((l) => l.id === currentId);
  const options = useMemo(() => {
    const list: { id: string | null; name: string; archived?: boolean }[] = [];
    if (showAgency) list.push({ id: null, name: "Agency view" });
    const needle = q.trim().toLowerCase();
    for (const l of locations) if (!needle || l.name.toLowerCase().includes(needle)) list.push(l);
    return needle ? list.filter((o) => o.id !== null || "agency view".includes(needle)) : list;
  }, [locations, q, showAgency]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  function choose(id: string | null) {
    setOpen(false);
    setQ("");
    if (id === null) return router.push("/agency");
    // Stay on the same module: /l/A/contacts → /l/B/contacts.
    const m = /^\/l\/[^/]+\/([^/]+)/.exec(pathname);
    const section = m?.[1] ?? "dashboard";
    start(async () => {
      await rememberLocation(id);
      router.push(`/l/${id}/${section}`);
    });
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex h-8 max-w-64 items-center gap-2 rounded-md border border-border bg-surface px-2.5 text-sm hover:bg-surface-2"
      >
        <Building2 className="h-4 w-4 shrink-0 text-muted" aria-hidden />
        <span className={cn("truncate font-medium", pending && "opacity-60")}>{current?.name ?? "Agency view"}</span>
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
      </button>
      {open ? (
        <div className="absolute left-0 z-50 mt-1 w-72 rounded-lg border border-border bg-surface shadow-lg">
          <div className="flex items-center gap-2 border-b border-border px-2.5">
            <Search className="h-3.5 w-3.5 text-muted" aria-hidden />
            <input
              autoFocus
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setActive(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") setActive((a) => Math.min(a + 1, options.length - 1));
                else if (e.key === "ArrowUp") setActive((a) => Math.max(a - 1, 0));
                else if (e.key === "Enter" && options[active]) choose(options[active]!.id);
                else if (e.key === "Escape") setOpen(false);
                else return;
                e.preventDefault();
              }}
              placeholder="Search sub-accounts…"
              aria-label="Search sub-accounts"
              className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-muted"
            />
          </div>
          <ul role="listbox" className="max-h-80 overflow-y-auto p-1">
            {options.map((o, i) => {
              const selected = o.id === currentId;
              return (
                <li key={o.id ?? "agency"} role="option" aria-selected={selected}>
                  <button
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => choose(o.id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                      i === active && "bg-surface-2",
                      o.id === null && "font-medium text-primary",
                    )}
                  >
                    <span className="flex-1 truncate">{o.name}</span>
                    {o.archived ? <span className="text-[10px] text-muted">Archived</span> : null}
                    {selected ? <Check className="h-3.5 w-3.5 text-primary" aria-hidden /> : null}
                  </button>
                </li>
              );
            })}
            {options.length === 0 ? <li className="px-2 py-3 text-center text-sm text-muted">No matches</li> : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
