"use client";
/**
 * Generic admin form: binds any AdminState server action, shows its answer
 * next to the button, and can ask for a second click on risky actions.
 */
import { useActionState, useState, type ReactNode } from "react";
import type { AdminState } from "./actions";

type Action = (prev: AdminState, form: FormData) => Promise<AdminState>;

export function ActionForm({ action, children, submit, pendingLabel, tone = "secondary", confirm, className = "" }: {
  action: Action; children?: ReactNode; submit: string; pendingLabel?: string; tone?: "primary" | "secondary" | "quiet"; confirm?: string; className?: string;
}) {
  const [state, run, pending] = useActionState(action, {});
  const [armed, setArmed] = useState(false);
  const btn = tone === "primary" ? "btn-primary" : tone === "quiet" ? "btn-quiet" : "btn-secondary";
  return (
    <form action={run} className={`space-y-2 ${className}`} onSubmit={(e) => { if (confirm && !armed) { e.preventDefault(); setArmed(true); } }}>
      {children}
      <div className="flex flex-wrap items-center gap-2">
        <button className={`${btn} py-2 text-sm`} disabled={pending}>{pending ? pendingLabel ?? "Working…" : armed ? confirm : submit}</button>
        {armed && !pending && <button type="button" className="btn-quiet py-2 text-sm" onClick={() => setArmed(false)}>Cancel</button>}
        {state.error && <span role="alert" className="text-sm text-danger">{state.error}</span>}
        {state.message && <span role="status" className="text-sm text-success">{state.message}</span>}
      </div>
    </form>
  );
}
