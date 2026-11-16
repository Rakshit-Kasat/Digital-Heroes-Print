"use client";
/**
 * Staff proof upload (for customer PDF/AI files the system cannot render).
 * The PNG goes browser -> storage into the admin's own folder, then the
 * uploadProof action checks the path and the bytes and creates vN.
 */
import { useActionState, useRef, useState } from "react";
import { uploadToDesign } from "@/lib/upload.client";
import { uploadProof, type AdminState } from "../../actions";

export function ProofUpload({ orderId, adminId }: { orderId: string; adminId: string }) {
  const [state, run, pending] = useActionState(uploadProof, {} as AdminState);
  const [path, setPath] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const input = useRef<HTMLInputElement>(null);

  async function pick(file?: File) {
    setErr(""); setPath("");
    if (!file) return;
    if (!/\.png$/i.test(file.name)) { setErr("Choose a PNG image."); return; }
    setBusy(true);
    try { setPath(await uploadToDesign(file, adminId, orderId, "proof")); }
    catch (e) { setErr(e instanceof Error ? e.message : "Upload failed."); }
    finally { setBusy(false); }
  }

  return (
    <form action={run} className="space-y-2">
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="path" value={path} />
      <h3 className="mb-2 font-display text-base font-bold">From an image you made</h3>
      <label className="label" htmlFor="proof-file">Proof image (PNG, up to 15 MB)</label>
      <input ref={input} id="proof-file" type="file" accept=".png,image/png" className="field file:mr-3 file:rounded file:border-0 file:bg-mist file:px-2 file:py-1" onChange={(e) => pick(e.target.files?.[0])} disabled={busy || pending} />
      <label className="label" htmlFor="upload-note">Note sent with this upload <span className="font-normal text-steel">(optional)</span></label>
      <textarea id="upload-note" name="note" rows={2} maxLength={500} className="field" />
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-secondary py-2 text-sm" disabled={!path || busy || pending}>{busy ? "Uploading…" : pending ? "Sending…" : "Send as next proof version"}</button>
        {(err || state.error) && <span role="alert" className="text-sm text-danger">{err || state.error}</span>}
        {state.message && <span role="status" className="text-sm text-success">{state.message}</span>}
      </div>
    </form>
  );
}
