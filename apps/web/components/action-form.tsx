"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form";
import type { ActionState } from "@/lib/context";

/** A <form> bound to a server action that returns { error | ok }, with a pending-aware submit button. */
export function ActionForm({
  action,
  submitLabel,
  disabled,
  className,
  children,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  submitLabel: string;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className={className}>
      <fieldset disabled={disabled || pending} className="contents">
        {children}
      </fieldset>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={disabled || pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
