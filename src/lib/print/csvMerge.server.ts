/**
 * Server-side CSV merge (PRD §07): one vector PDF per valid row, named by the
 * order convention, zipped together with a row-by-row report (report.csv) so
 * staff can see exactly which rows were produced and why any were skipped.
 */
import "server-only";
import { zipSync } from "fflate";
import { applyRow } from "@/lib/design/template";
import type { DesignDoc } from "@/lib/design/types";
import { checkCsv, toCsv, type CsvCheck } from "./csv";
import { serverMeasure } from "./fonts.server";
import { layoutForPrint, printFileName, renderPdf, type ImageMap } from "./render";

export interface MergeResult { zip: Uint8Array; check: CsvCheck; produced: number; zipName: string }

export async function mergeCsv(
  doc: DesignDoc,
  csvText: string,
  ctx: { orderNumber: string; productSlug: string; date: Date; images: ImageMap },
): Promise<MergeResult> {
  const check = checkCsv(doc, csvText, serverMeasure);
  if (check.fatal) throw new Error(check.fatal);

  const files: Record<string, Uint8Array> = {};
  const report: Array<Array<string | number>> = [["row", "status", "file", "message", ...check.fields]];
  let produced = 0;
  for (const v of check.rows) {
    let file = "";
    if (v.status !== "error") {
      const output = `${String(v.row).padStart(4, "0")}-${v.label}`;
      file = printFileName(ctx.orderNumber, ctx.productSlug, ctx.date, output, "pdf");
      const layout = layoutForPrint(applyRow(doc, v.values));
      files[file] = await renderPdf(layout, ctx.images, { title: file, slugLine: `${file} · row ${v.row}` });
      produced++;
    }
    report.push([v.row, v.status, file, v.message, ...check.fields.map((f) => v.values[f])]);
  }
  files["report.csv"] = new TextEncoder().encode(toCsv(report));
  // PDFs are already compressed; level 1 keeps the zip step fast.
  const zip = zipSync(files, { level: 1 });
  return { zip, check, produced, zipName: printFileName(ctx.orderNumber, ctx.productSlug, ctx.date, "CSV-merge", "zip") };
}
