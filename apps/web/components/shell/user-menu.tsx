"use client";

import { useEffect, useRef, useState } from "react";
import { LogOut, Monitor, Moon, Sun } from "lucide-react";
import { signOut } from "@/app/login/actions";
import { cn } from "@/lib/utils";
import { setTheme } from "./actions";

export function UserMenu({ name, email, role }: { name: string | null; email: string; role: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const initials = (name ?? email).split(/[\s@.]+/).slice(0, 2).map((s) => s[0]?.toUpperCase()).join("");

  function applyTheme(t: "light" | "dark" | "system") {
    const el = document.documentElement;
    el.classList.remove("light", "dark");
    if (t !== "system") el.classList.add(t);
    void setTheme(t);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="User menu"
        aria-expanded={open}
        className="grid h-8 w-8 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
      >
        {initials}
      </button>
      {open ? (
        <div className="absolute right-0 z-50 mt-1 w-60 rounded-lg border border-border bg-surface p-1 shadow-lg">
          <div className="px-2.5 py-2">
            <div className="truncate text-sm font-medium">{name ?? email}</div>
            <div className="truncate text-xs text-muted">{email}</div>
            <div className="mt-1 text-[11px] text-muted">{role}</div>
          </div>
          <div className="my-1 border-t border-border" />
          <div className="flex gap-1 px-1.5 py-1" role="group" aria-label="Theme">
            {([["light", Sun], ["dark", Moon], ["system", Monitor]] as const).map(([t, Icon]) => (
              <button
                key={t}
                type="button"
                onClick={() => applyTheme(t)}
                className={cn("flex flex-1 items-center justify-center gap-1 rounded-md py-1 text-xs capitalize hover:bg-surface-2")}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden />
                {t}
              </button>
            ))}
          </div>
          <div className="my-1 border-t border-border" />
          <form action={signOut}>
            <button type="submit" className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm hover:bg-surface-2">
              <LogOut className="h-4 w-4" aria-hidden /> Sign out
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
