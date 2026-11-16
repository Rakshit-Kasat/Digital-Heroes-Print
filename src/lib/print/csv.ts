/**
 * Variable-data (CSV) parsing and validation — the pure half of the merge,
 * shared by the customer's upload check (instant feedback) and the server
 * merge. Every row gets a verdict so nothing is silently dropped.
 */
import Papa from "papaparse";
import { applyRow, designFields } from "@/lib/design/template";
import { layoutDesign } from "@/lib/design/layout";
import type { DesignDoc } from "@/lib/design/types";
import type { Measure } from "@/lib/layout/fitText";

export const MAX_CSV_ROWS = 1000;

export interface RowVerdict {
  row: number;            // 1-based data row (header excluded)
  status: "ok" | "warning" | "error";
  message: string;
  label: string;          // used in the output file name (e.g. the race number)
  values: Record<string, string>;
}

export interface CsvCheck {
  fields: string[];       // columns the design needs
  headers: string[];
  missingColumns: string[];
  rows: RowVerdict[];
  fatal: string | null;   // whole-file problem (no rows, too many, missing columns)
}

export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[]; errors: string[] } {
  const res = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ""), { header: true, skipEmptyLines: "greedy", transformHeader: (h) => h.trim() });
  return { headers: res.meta.fields ?? [], rows: res.data, errors: res.errors.map((e) => `Row ${(e.row ?? 0) + 1}: ${e.message}`) };
}

export function checkCsv(doc: DesignDoc, text: string, measure: Measure): CsvCheck {
  const fields = designFields(doc);
  const { headers, rows, errors } = parseCsv(text);
  const lower = new Set(headers.map((h) => h.toLowerCase()));
  const missingColumns = fields.filter((f) => !lower.has(f.toLowerCase()));
  const base = { fields, headers, missingColumns, rows: [] as RowVerdict[] };

  if (fields.length === 0) return { ...base, fatal: "This design has no merge fields, so a CSV cannot change it." };
  if (missingColumns.length) return { ...base, fatal: `The CSV is missing column(s): ${missingColumns.join(", ")}. Expected: ${fields.join(", ")}.` };
  if (rows.length === 0) return { ...base, fatal: "The CSV has a header but no data rows." };
  if (rows.length > MAX_CSV_ROWS) return { ...base, fatal: `The CSV has ${rows.length} rows; the limit per order line is ${MAX_CSV_ROWS}. Split it into several orders.` };
  if (errors.length) return { ...base, fatal: `The CSV could not be read: ${errors.slice(0, 3).join("; ")}` };

  const get = (r: Record<string, string>, f: string) => {
    const key = Object.keys(r).find((k) => k.toLowerCase() === f.toLowerCase());
    return (key ? r[key] : "")?.toString().trim() ?? "";
  };
  const seen = new Map<string, number>();
  const verdicts = rows.map((r, i): RowVerdict => {
    const values = Object.fromEntries(fields.map((f) => [f, get(r, f)]));
    const label = values.number || values[fields[0]] || String(i + 1);
    const empty = fields.filter((f) => !values[f]);
    if (empty.length) return { row: i + 1, status: "error", message: `Empty value for ${empty.join(", ")}.`, label, values };
    const layout = layoutDesign(applyRow(doc, values), measure);
    const overflow = layout.warnings.find((w) => w.level === "error" && w.message.includes("does not fit"));
    if (overflow) return { row: i + 1, status: "error", message: overflow.message, label, values };
    const key = label.toLowerCase();
    const dupe = seen.get(key);
    seen.set(key, i + 1);
    if (dupe) return { row: i + 1, status: "warning", message: `Same value “${label}” as row ${dupe}.`, label, values };
    // Shrink-to-fit is the fit rule working, not a problem: report it as info.
    const shrunk = layout.warnings.find((w) => w.level === "warning");
    return { row: i + 1, status: "ok", message: shrunk?.message ?? "", label, values };
  });
  return { ...base, rows: verdicts, fatal: null };
}

/** RFC 4180 CSV writer for reports and exports. */
export function toCsv(rows: Array<Array<string | number>>): string {
  const cell = (v: string | number) => {
    const s = String(v);
    // Leading = + - @ would run as formulas in spreadsheets: neutralise them.
    const safe = /^[=+\-@]/.test(s) && !/^-?\d/.test(s) ? `'${s}` : s;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}
