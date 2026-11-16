"use client";
/**
 * "Upload print-ready file" (PRD §06: PDF, SVG, PNG, AI). PNG and SVG are
 * placed full-bleed and proofed automatically. PDF and AI files are kept
 * as-is for the prepress team, who send the first proof by hand.
 */
import { useState } from "react";
import { extOf, uploadToDesign } from "@/lib/upload.client";
import type { UploadKind } from "./actions";

const KINDS: UploadKind[] = ["pdf", "svg", "png", "ai"];

export function UploadPanel({ uid, designId, size, bleed, dpi, current, onUploaded, onRemove }: {
  uid: string;
  designId: string;
  size: { widthMm: number; heightMm: number };
  bleed: number;
  dpi: number;
  current: { path: string; kind: UploadKind; url: string | null } | null;
  onUploaded: (path: string, kind: UploadKind, file: File) => Promise<string | null>;
  onRemove: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const fullW = size.widthMm + 2 * bleed, fullH = size.heightMm + 2 * bleed;
  const px = (mm: number) => Math.ceil((mm / 25.4) * dpi);

  async function take(file: File | undefined) {
    if (!file) return;
    const kind = extOf(file.name) as UploadKind;
    setError(null);
    if (!KINDS.includes(kind)) return setError("Use a PDF, SVG, PNG or AI file.");
    setBusy(true);
    try {
      const path = await uploadToDesign(file, uid, designId, "artwork");
      const err = await onUploaded(path, kind, file);
      if (err) setError(err);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="panel space-y-1 p-4 text-sm">
        <p className="font-semibold">Set your file up like this</p>
        <p>Page size <strong>{fullW} × {fullH} mm</strong>: the {size.widthMm} × {size.heightMm} mm trim plus {bleed} mm bleed on every side.</p>
        <p>For PNG, at least <strong>{px(fullW).toLocaleString("en-GB")} × {px(fullH).toLocaleString("en-GB")} px</strong> ({dpi} dpi).</p>
        <p className="text-steel">Keep text and logos inside the safe margin, away from the trim edge. Fonts in PDFs should be embedded or outlined.</p>
      </div>

      <label
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files[0]); }}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors ${over ? "border-accent bg-accent/5" : "border-hairline bg-sheet hover:border-ink/40"}`}
      >
        <input type="file" className="sr-only" accept=".pdf,.svg,.png,.ai,application/pdf,image/svg+xml,image/png,application/postscript" disabled={busy} onChange={(e) => take(e.target.files?.[0])} />
        <span className="font-semibold">{busy ? "Uploading and checking…" : "Drop your file here or choose one"}</span>
        <span className="mt-1 text-sm text-steel">PDF, SVG, PNG or AI, up to 15 MB</span>
      </label>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}

      {current && (
        <div className="panel flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
          <div>
            <p className="font-semibold">Attached: {current.path.split("/").pop()}</p>
            <p className="text-steel">
              {current.kind === "pdf" || current.kind === "ai"
                ? "Our prepress team checks PDF and AI files and sends your first proof within one working day of payment."
                : "Shown on the Design tab. You can add text on top before checkout."}
            </p>
          </div>
          <div className="flex gap-2">
            {current.url && <a className="btn-secondary px-3 py-1.5" href={current.url} target="_blank" rel="noreferrer">Open file</a>}
            <button type="button" className="btn-quiet text-danger hover:text-danger" onClick={onRemove}>Remove</button>
          </div>
        </div>
      )}
    </div>
  );
}
