/** Integration: the real fonts, the real PDF/PNG engine, the real CSV merge. */
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { unzipSync } from "fflate";
import { instantiateTemplate } from "@/lib/design/template";
import { layoutForPrint, printFileName, renderPdf, renderPng } from "@/lib/print/render";
import { mergeCsv } from "@/lib/print/csvMerge.server";
import type { TemplateDoc } from "@/lib/design/types";

const tpl: TemplateDoc = {
  background: "#ffffff",
  elements: [
    { id: "band", type: "rect", x: 0, y: 0, w: 1, h: 0.2, rotation: 0, fill: "#c4105f", locked: true },
    { id: "number", type: "text", x: 0.06, y: 0.24, w: 0.88, h: 0.52, rotation: 0, text: "1042", font: "anton", size: 0.5, color: "#000000", align: "center", fit: { shrinkToFit: true, minPt: 40, maxPt: 220 }, field: "number" },
    { id: "name", type: "text", x: 0.06, y: 0.79, w: 0.88, h: 0.13, rotation: 5, text: "ALEX MORGAN", font: "lato", bold: true, size: 0.1, color: "#000000", align: "center", fit: { shrinkToFit: true, minPt: 10, maxPt: 34, tracking: 30 }, field: "name" },
  ],
};
const doc = instantiateTemplate(tpl, { widthMm: 210, heightMm: 148 }, { bleed_mm: 3, safe_mm: 5 });

describe("print engine", () => {
  it("makes a vector PDF with trim and bleed boxes", async () => {
    const bytes = await renderPdf(layoutForPrint(doc), new Map(), { title: "t", slugLine: "slug" });
    const pdf = await PDFDocument.load(bytes);
    const page = pdf.getPage(0);
    const mm = (pt: number) => Math.round((pt * 25.4) / 72 * 10) / 10;
    expect(mm(page.getTrimBox().width)).toBe(210);
    expect(mm(page.getBleedBox().width)).toBe(216);
    expect(mm(page.getWidth())).toBe(240); // + 12 mm slug each side for crop marks
  });

  it("makes a PNG at the requested dpi", () => {
    const { png, dpi } = renderPng(layoutForPrint(doc), new Map(), 72);
    expect(dpi).toBe(72);
    expect(png.subarray(1, 4).toString()).toBe("PNG");
    expect(png.readUInt32BE(16)).toBe(Math.round((216 / 25.4) * 72)); // width in px
  });

  it("follows the naming convention", () => {
    expect(printFileName("DH-001042", "race-bibs", new Date("2026-11-17T09:00:00Z"), "Print PDF", "pdf")).toBe("DH-001042_race-bibs_20261117_Print-PDF.pdf");
  });

  it("merges a CSV into one PDF per valid row plus a report", async () => {
    const csv = "number,name\n101,Ann Lee\n102,\n103,Bartholomew Featherstonehaugh-Smythe\n";
    const r = await mergeCsv(doc, csv, { orderNumber: "DH-001042", productSlug: "race-bibs", date: new Date("2026-11-17"), images: new Map() });
    const files = Object.keys(unzipSync(r.zip));
    expect(r.produced).toBe(2);
    expect(files).toContain("report.csv");
    expect(files).toContain("DH-001042_race-bibs_20261117_0001-101.pdf");
    expect(files.filter((f) => f.endsWith(".pdf"))).toHaveLength(2);
  });
});
