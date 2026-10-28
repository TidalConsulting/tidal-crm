import { Card } from "@/components/ui/card";

export function ComingSoon({ title, phase, context, tabs }: { title: string; phase: number; context?: string; tabs?: string[] }) {
  return (
    <Card className="p-8 text-center">
      <div className="text-xs font-semibold tracking-wider text-primary uppercase">Phase {phase}</div>
      <h2 className="mt-1 text-base font-semibold">{title}</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted">
        This module is planned for phase {phase} of the build (SPEC.md §9){context ? ` and will show ${context}'s data` : ""}.
      </p>
      {tabs?.length ? (
        <div className="mt-4 flex flex-wrap justify-center gap-1.5">
          {tabs.map((t) => (
            <span key={t} className="rounded border border-border px-2 py-0.5 text-xs text-muted">
              {t}
            </span>
          ))}
        </div>
      ) : null}
    </Card>
  );
}
