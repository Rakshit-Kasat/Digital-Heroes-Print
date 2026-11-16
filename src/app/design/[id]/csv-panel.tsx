"use client";
/**
 * Names and numbers from a CSV (PRD §08 variable data). The file is checked
 * in the browser with the SAME checkCsv() the server merge uses, so every
 * row's verdict here matches what will be produced.
 */
import { useState } from "react";
import { checkCsv, MAX_CSV_ROWS, type CsvCheck } from "@/lib/print/csv";
import { applyRow, designFields } from "@/lib/design/template";
import { clientMeasure } from "@/lib/design/measure.client";
import { uploadToDesign } from "@/lib/upload.client";
import { LivePreview } from "@/components/live-preview";
import type { DesignDoc } from "@/lib/design/types";

export function CsvPanel({ doc, uid, designId, imageUrls, attached, onAttach, onDetach }: {
  doc: DesignDoc;
  uid: string;
  designId: string;
  imageUrls: Record<string, string>;
  attached: { path: string; rows: number } | null;
  onAttach: (path: string, rows: number) => void;
  onDetach: () => void;
}) {
  const fields = designFields(doc);
  const [check, setCheck] = useState<CsvCheck | null>(null);
  const [row, setRow] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A two-row example with the right headers, offered as a download.
  const ex = (f: string, i: number) => (/num/i.test(f) ? String(101 + i) : `${f} ${i + 1}`);
  const sample = `data:text/csv;charset=utf-8,${encodeURIComponent([fields.join(","), fields.map((f) => ex(f, 0)).join(","), fields.map((f) => ex(f, 1)).join(",")].join("\n"))}`;

  if (!fields.length) {
    return (
      <div className="panel p-4 text-sm">
        <p className="font-semibold">No merge fields yet</p>
        <p className="mt-1 text-steel">On the Design tab, select a text box and type a column name into “Fill from CSV column” (for example <code>number</code> or <code>name</code>). Then come back here.</p>
      </div>
    );
  }

  async function take(file: File | undefined) {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const text = await file.text();
      const result = checkCsv(doc, text, clientMeasure);
      setCheck(result);
      setRow(0);
      const bad = result.rows.filter((r) => r.status === "error").length;
      if (!result.fatal && bad === 0) {
        const path = await uploadToDesign(file, uid, designId, "data");
        onAttach(path, result.rows.length);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read the CSV.");
    } finally {
      setBusy(false);
    }
  }

  const counts = check ? { ok: check.rows.filter((r) => r.status === "ok").length, warning: check.rows.filter((r) => r.status === "warning").length, error: check.rows.filter((r) => r.status === "error").length } : null;
  const current = check?.rows[row];

  return (
    <div className="space-y-5">
      <div className="panel p-4 text-sm">
        <p>Columns this design needs: {fields.map((f) => <code key={f} className="mr-1 rounded bg-mist px-1.5 py-0.5">{f}</code>)}</p>
        <p className="mt-1 text-steel">One row per item, up to {MAX_CSV_ROWS.toLocaleString("en-GB")} rows. Each row becomes its own print-ready PDF.</p>
        <a className="link mt-2 inline-block" href={sample} download="names-and-numbers.csv">Download a sample CSV</a>
      </div>

      <label className="flex cursor-pointer flex-col items-center rounded-lg border-2 border-dashed border-hairline bg-sheet px-6 py-8 text-center hover:border-ink/40">
        <input type="file" accept=".csv,text/csv" className="sr-only" disabled={busy} onChange={(e) => { take(e.target.files?.[0]); e.target.value = ""; }} />
        <span className="font-semibold">{busy ? "Checking every row…" : attached ? "Replace CSV" : "Choose a CSV file"}</span>
      </label>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}

      {attached && !check && (
        <div className="flex items-center justify-between rounded-md bg-success/10 px-3 py-2 text-sm">
          <span>CSV attached: {attached.rows.toLocaleString("en-GB")} rows.</span>
          <button type="button" className="btn-quiet text-sm" onClick={onDetach}>Remove</button>
        </div>
      )}

      {check?.fatal && <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{check.fatal}</p>}

      {check && !check.fatal && counts && (
        <>
          <p aria-live="polite" className={`rounded-md px-3 py-2 text-sm ${counts.error ? "bg-danger/10 text-danger" : "bg-success/10"}`}>
            {counts.error
              ? `${counts.error} of ${check.rows.length} rows need fixing (marked below). Correct the CSV and upload it again.`
              : `All ${check.rows.length} rows fit. ${counts.warning ? `${counts.warning} look like duplicates; check them. ` : ""}The CSV is attached to this order.`}
          </p>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="max-h-80 overflow-auto rounded-md border border-hairline">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-mist text-left"><tr><th className="px-2 py-1.5">Row</th>{fields.map((f) => <th key={f} className="px-2 py-1.5">{f}</th>)}<th className="px-2 py-1.5">Check</th></tr></thead>
                <tbody>
                  {check.rows.slice(0, 300).map((r, i) => (
                    <tr key={r.row} onClick={() => setRow(i)} className={`cursor-pointer border-t border-hairline ${i === row ? "bg-accent/5" : "hover:bg-mist/60"}`}>
                      <td className="px-2 py-1 text-steel">{r.row}</td>
                      {fields.map((f) => <td key={f} className="max-w-32 truncate px-2 py-1">{r.values[f]}</td>)}
                      <td className={`px-2 py-1 ${r.status === "error" ? "text-danger" : r.status === "warning" ? "text-warning" : "text-success"}`} title={r.message}>{r.status === "ok" ? (r.message ? "Shrunk" : "OK") : r.status === "warning" ? "Check" : "Fix"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {check.rows.length > 300 && <p className="p-2 text-xs text-steel">Showing the first 300 rows; all {check.rows.length} were checked.</p>}
            </div>
            {current && (
              <div>
                <p className="mb-2 text-sm text-steel">Row {current.row}{current.message ? `: ${current.message}` : ""}</p>
                <LivePreview doc={applyRow(doc, current.values)} imageUrls={imageUrls} label={`Preview of row ${current.row}`} />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
