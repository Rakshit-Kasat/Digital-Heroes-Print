"use client";
/**
 * Small interactive pieces of the customer area. Each is a plain <form>
 * bound to a server action with useActionState, so it also works before
 * JavaScript loads (progressive enhancement) and shows the server's answer.
 */
import { useActionState, useState } from "react";
import { approve, askForChanges, reorderAction, updateProfile, type FormState } from "./actions";

function Notice({ state }: { state: FormState }) {
  if (state.error) return <p role="alert" className="rounded-md bg-danger/8 px-3 py-2 text-sm text-danger">{state.error}</p>;
  if (state.message) return <p role="status" className="rounded-md bg-success/10 px-3 py-2 text-sm text-success">{state.message}</p>;
  return null;
}

export function ProfileForm({ fullName, company, phone }: { fullName: string; company: string; phone: string }) {
  const [state, action, pending] = useActionState(updateProfile, {});
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-3" noValidate>
      <div>
        <label className="label" htmlFor="fullName">Name</label>
        <input className="field" id="fullName" name="fullName" autoComplete="name" defaultValue={fullName} required />
      </div>
      <div>
        <label className="label" htmlFor="company">Company or club</label>
        <input className="field" id="company" name="company" autoComplete="organization" defaultValue={company} />
      </div>
      <div>
        <label className="label" htmlFor="phone">Phone</label>
        <input className="field" id="phone" name="phone" type="tel" autoComplete="tel" defaultValue={phone} />
      </div>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-3">
        <button className="btn-secondary" disabled={pending}>{pending ? "Saving…" : "Save details"}</button>
        <Notice state={state} />
      </div>
    </form>
  );
}

export function ReorderButton({ orderId, label = "Reorder" }: { orderId: string; label?: string }) {
  const [state, action, pending] = useActionState(reorderAction, {});
  return (
    <form action={action} className="inline">
      <input type="hidden" name="orderId" value={orderId} />
      <button className="btn-secondary py-1.5 text-sm" disabled={pending}>{pending ? "Starting…" : label}</button>
      {state.error && <span role="alert" className="ml-2 text-sm text-danger">{state.error}</span>}
    </form>
  );
}

/** Approve, or switch to the change-request form. Approving needs an explicit tick. */
export function ProofDecision({ proofId, version }: { proofId: string; version: number }) {
  const [mode, setMode] = useState<"approve" | "changes">("approve");
  const [approved, approveAct, approving] = useActionState(approve, {});
  const [changed, changesAct, sending] = useActionState(askForChanges, {});
  if (approved.ok) return <Notice state={approved} />;
  if (changed.ok) return <Notice state={changed} />;

  return (
    <div className="space-y-3">
      <div role="tablist" aria-label="Your decision" className="inline-flex rounded-md border border-hairline bg-mist p-0.5 text-sm">
        {(["approve", "changes"] as const).map((m) => (
          <button key={m} role="tab" type="button" aria-selected={mode === m} onClick={() => setMode(m)}
            className={`min-h-10 rounded px-3 py-1.5 font-medium ${mode === m ? "bg-sheet text-ink shadow-sm" : "text-steel hover:text-ink"}`}>
            {m === "approve" ? "It looks right" : "I want changes"}
          </button>
        ))}
      </div>
      {mode === "approve" ? (
        <form action={approveAct} className="space-y-3">
          <input type="hidden" name="proofId" value={proofId} />
          <label className="flex items-start gap-2.5 text-sm">
            <input type="checkbox" name="confirm" className="mt-0.5 size-4 accent-[var(--color-accent)]" required />
            <span>I have checked spelling, numbers, colours and position. Print exactly this version.</span>
          </label>
          <button className="btn-primary" disabled={approving}>{approving ? "Approving…" : `Approve proof v${version}`}</button>
          <Notice state={approved} />
        </form>
      ) : (
        <form action={changesAct} className="space-y-3">
          <input type="hidden" name="proofId" value={proofId} />
          <label className="label" htmlFor="note">What should we change?</label>
          <textarea id="note" name="note" rows={4} maxLength={2000} className="field" placeholder="For example: make the club name larger and use navy instead of black." required />
          <button className="btn-secondary" disabled={sending}>{sending ? "Sending…" : "Send change request"}</button>
          <Notice state={changed} />
        </form>
      )}
    </div>
  );
}
