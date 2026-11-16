import { describe, expect, it } from "vitest";
import { calculatePrice, formatMoney, tierFor, validateConfig } from "@/lib/pricing/calculate";
import { fitText, type Measure } from "@/lib/layout/fitText";
import { constrainBox, isInside, rotatedBounds } from "@/lib/layout/constrain";
import { applyRow, designFields, instantiateTemplate, uploadDesign } from "@/lib/design/template";
import { layoutDesign } from "@/lib/design/layout";
import { toSvg } from "@/lib/design/svg";
import { canTransition, nextStage, printFilesUnlocked } from "@/lib/orders/pipeline";
import { checkCsv, toCsv } from "@/lib/print/csv";
import { xeroCsvAdapter } from "@/lib/accounting/xero";
import type { ConfigSchema, PricingRules } from "@/lib/catalog/types";
import type { DesignDoc, TemplateDoc } from "@/lib/design/types";

// A predictable fake font: every character is 0.6 em wide.
const fakeMeasure: Measure = (text, _f, _b, sizeMm) => text.length * 0.6 * sizeMm;

const labelSchema: ConfigSchema = {
  width: { min: 20, max: 300, default: 90 }, height: { min: 20, max: 300, default: 60 }, presets: [],
  materials: [{ id: "gloss", name: "Gloss", mult: 1 }, { id: "vinyl", name: "Vinyl", mult: 1.35 }],
  quantity: { min: 10, max: 50000, default: 250 },
};
const labelPricing: PricingRules = {
  base: 2, ratePerCm2: 0.35, minUnit: 4, setupFee: 1500,
  tiers: [{ min: 100, discount: 0.1 }, { min: 250, discount: 0.15 }, { min: 500, discount: 0.2 }, { min: 1000, discount: 0.3 }],
};

describe("pricing", () => {
  it("prices area x rate, applies the volume tier, setup fee and VAT in whole pence", () => {
    const p = calculatePrice(labelSchema, labelPricing, { widthMm: 90, heightMm: 60, materialId: "gloss", quantity: 250 }, 0.2);
    expect(p.areaCm2).toBe(54);
    expect(p.unitBeforeDiscount).toBeCloseTo(20.9);
    expect(p.discountRate).toBe(0.15);
    expect(p.itemsPence).toBe(4441); // round(20.9 * 250 * 0.85) = round(4441.25)
    expect(p.subtotalPence).toBe(5941);
    expect(p.vatPence).toBe(1188);
    expect(p.totalPence).toBe(7129);
    expect(Number.isInteger(p.totalPence)).toBe(true);
  });

  it("picks the highest tier reached and none below the first", () => {
    expect(tierFor(labelPricing.tiers, 99)).toBe(0);
    expect(tierFor(labelPricing.tiers, 100)).toBe(0.1);
    expect(tierFor(labelPricing.tiers, 999)).toBe(0.2);
    expect(tierFor(labelPricing.tiers, 50000)).toBe(0.3);
    expect(tierFor([{ min: 500, discount: 0.2 }, { min: 100, discount: 0.1 }], 600)).toBe(0.2); // unsorted input
  });

  it("applies the material multiplier and the per-unit minimum", () => {
    const vinyl = calculatePrice(labelSchema, labelPricing, { widthMm: 90, heightMm: 60, materialId: "vinyl", quantity: 10 }, 0.2);
    expect(vinyl.unitBeforeDiscount).toBeCloseTo(20.9 * 1.35);
    const tiny = calculatePrice(labelSchema, labelPricing, { widthMm: 20, heightMm: 20, materialId: "gloss", quantity: 10 }, 0.2);
    expect(tiny.unitBeforeDiscount).toBe(4); // 2 + 4*0.35 = 3.4 -> floored to minUnit 4
  });

  it("tells the customer the next saving", () => {
    const p = calculatePrice(labelSchema, labelPricing, { widthMm: 90, heightMm: 60, materialId: "gloss", quantity: 120 }, 0.2);
    expect(p.nextTier).toEqual({ min: 250, discount: 0.15 });
  });

  it("rejects out-of-range configurations", () => {
    expect(validateConfig(labelSchema, { widthMm: 90, heightMm: 60, materialId: "gloss", quantity: 250 })).toEqual([]);
    const errs = validateConfig(labelSchema, { widthMm: 5, heightMm: 999, materialId: "gold", quantity: 2.5 });
    expect(errs).toHaveLength(4);
    expect(() => calculatePrice(labelSchema, labelPricing, { widthMm: 90, heightMm: 60, materialId: "gold", quantity: 10 }, 0.2)).toThrow();
  });

  it("formats money", () => {
    expect(formatMoney(712900)).toBe("£7,129.00");
    expect(formatMoney(4.3, "GBP", true)).toBe("£0.043");
  });
});

describe("fitText", () => {
  const box = { font: "lato" as const, bold: false, w: 50, h: 20 };
  it("shrinks to the largest size that fits the width", () => {
    const r = fitText({ ...box, text: "ABCDEFGHIJ", size: 60, fit: { shrinkToFit: true, minPt: 6, maxPt: 60 } }, fakeMeasure);
    expect(r.overflow).toBe(false);
    expect(r.sizePt).toBeGreaterThan(23.3); // 50mm / (10 * 0.6) = 8.33mm = 23.6pt
    expect(r.sizePt).toBeLessThanOrEqual(23.7);
  });
  it("never goes under the minimum and flags overflow instead", () => {
    const r = fitText({ ...box, text: "ABCDEFGHIJ", size: 60, fit: { shrinkToFit: true, minPt: 30, maxPt: 60 } }, fakeMeasure);
    expect(r.overflow).toBe(true);
    expect(r.sizePt).toBe(30);
  });
  it("keeps the requested size when it already fits, capped by maxPt", () => {
    const r = fitText({ ...box, text: "AB", size: 40, fit: { shrinkToFit: true, minPt: 6, maxPt: 20 } }, fakeMeasure);
    expect(r.sizePt).toBe(20);
  });
  it("wraps words onto new lines and honours explicit newlines", () => {
    const r = fitText({ ...box, w: 30, h: 100, text: "AAAA BBBB", size: 20 }, fakeMeasure);
    expect(r.lines.map((l) => l.text)).toEqual(["AAAA", "BBBB"]);
    const n = fitText({ ...box, w: 300, h: 100, text: "one\ntwo", size: 10 }, fakeMeasure);
    expect(n.lines).toHaveLength(2);
  });
  it("counts tracking in the width", () => {
    const loose = fitText({ ...box, text: "ABCDEFGHIJ", size: 60, fit: { shrinkToFit: true, minPt: 6, maxPt: 60, tracking: 200 } }, fakeMeasure);
    const tight = fitText({ ...box, text: "ABCDEFGHIJ", size: 60, fit: { shrinkToFit: true, minPt: 6, maxPt: 60 } }, fakeMeasure);
    expect(loose.sizePt).toBeLessThan(tight.sizePt);
  });
});

describe("print-area constraint", () => {
  const area = { x: 0, y: 0, w: 100, h: 50 };
  it("slides a box back inside", () => {
    expect(constrainBox({ x: 90, y: 10, w: 20, h: 10, rotation: 0 }, area)).toMatchObject({ x: 80, y: 10 });
    expect(constrainBox({ x: -5, y: -5, w: 20, h: 10, rotation: 0 }, area)).toMatchObject({ x: 0, y: 0 });
  });
  it("scales an oversized box down, keeping proportions", () => {
    const b = constrainBox({ x: 0, y: 0, w: 200, h: 20, rotation: 0 }, area);
    expect(b.w).toBeCloseTo(100);
    expect(b.h).toBeCloseTo(10);
  });
  it("accounts for rotation", () => {
    const b = rotatedBounds({ x: 0, y: 20, w: 40, h: 10, rotation: 90 });
    expect(b.bw).toBeCloseTo(10);
    expect(b.bh).toBeCloseTo(40);
    const fixed = constrainBox({ x: 40, y: 20, w: 60, h: 10, rotation: 90 }, area);
    expect(isInside(fixed, area)).toBe(true);
  });
});

const bibTemplate: TemplateDoc = {
  background: "#ffffff",
  elements: [
    { id: "band", type: "rect", x: 0, y: 0, w: 1, h: 0.2, rotation: 0, fill: "#c4105f", locked: true },
    { id: "number", type: "text", x: 0.06, y: 0.24, w: 0.88, h: 0.52, rotation: 0, text: "1042", font: "anton", size: 0.5, color: "#000000", align: "center", fit: { shrinkToFit: true, minPt: 40, maxPt: 220 }, field: "number" },
    { id: "name", type: "text", x: 0.06, y: 0.79, w: 0.88, h: 0.13, rotation: 0, text: "ALEX", font: "lato", bold: true, size: 0.1, color: "#000000", align: "center", fit: { shrinkToFit: true, minPt: 10, maxPt: 34 }, field: "name" },
  ],
};

describe("templates", () => {
  const doc = instantiateTemplate(bibTemplate, { widthMm: 210, heightMm: 148 }, { bleed_mm: 3, safe_mm: 5 });
  it("scales relative positions to millimetres", () => {
    const num = doc.elements.find((e) => e.id === "number")!;
    expect(num.x).toBeCloseTo(12.6);
    expect(num.w).toBeCloseTo(184.8);
  });
  it("runs edge-touching furniture into the bleed", () => {
    expect(doc.elements[0]).toMatchObject({ x: -3, y: -3, w: 216 });
  });
  it("lists and fills merge fields", () => {
    expect(designFields(doc)).toEqual(["number", "name"]);
    const filled = applyRow(doc, { Number: "77", NAME: "Sam" });
    expect(filled.elements.map((e) => (e.type === "text" ? e.text : null))).toEqual([null, "77", "Sam"]);
  });
  it("lays out and serialises to SVG with guides", () => {
    const layout = layoutDesign(doc, fakeMeasure);
    const svg = toSvg(layout, { guides: true });
    expect(svg).toContain('viewBox="-3 -3 216 154"');
    expect(svg).toContain(">1042</tspan>");
    expect(layout.warnings.filter((w) => w.level === "error")).toEqual([]);
  });
  it("flags customer elements outside the safe area", () => {
    const moved: DesignDoc = { ...doc, elements: [{ ...doc.elements[1], x: -10 }] };
    expect(layoutDesign(moved, fakeMeasure).warnings[0].level).toBe("error");
  });
  it("turns an upload into a full-bleed image document", () => {
    const up = uploadDesign("uploads/u/art.png", { widthMm: 100, heightMm: 50 }, { bleed_mm: 2, safe_mm: 3 });
    expect(up.elements[0]).toMatchObject({ x: -2, y: -2, w: 104, h: 54, locked: true });
  });
});

describe("pipeline", () => {
  it("only lets paid quotes become orders", () => {
    expect(canTransition("quote", "order", { paid: false, latestProof: null }).ok).toBe(false);
    expect(canTransition("quote", "order", { paid: true, latestProof: null }).ok).toBe(true);
  });
  it("blocks production until the latest proof is approved", () => {
    expect(canTransition("proof", "production", { paid: true, latestProof: "pending" }).ok).toBe(false);
    expect(canTransition("proof", "production", { paid: true, latestProof: "changes_requested" }).ok).toBe(false);
    expect(canTransition("proof", "production", { paid: true, latestProof: "approved" }).ok).toBe(true);
  });
  it("sends change requests back to artwork and forbids skipping stages", () => {
    expect(canTransition("proof", "artwork", { paid: true, latestProof: "changes_requested" }).ok).toBe(true);
    expect(canTransition("order", "production", { paid: true, latestProof: "approved" }).ok).toBe(false);
    expect(canTransition("completed", "quote", { paid: true, latestProof: "approved" }).ok).toBe(false);
  });
  it("knows the next stage and the print-file lock", () => {
    expect(nextStage("artwork")).toBe("proof");
    expect(nextStage("completed")).toBeNull();
    expect(printFilesUnlocked("pending")).toBe(false);
    expect(printFilesUnlocked("approved")).toBe(true);
  });
});

describe("CSV merge checks", () => {
  const doc = instantiateTemplate(bibTemplate, { widthMm: 210, heightMm: 148 }, { bleed_mm: 3, safe_mm: 5 });
  it("rejects a file missing a merge column", () => {
    expect(checkCsv(doc, "number\n1\n", fakeMeasure).fatal).toMatch(/missing column/);
  });
  it("gives every row a verdict", () => {
    const csv = "number,name\n1,Ann\n2,\n1,Bob\n";
    const r = checkCsv(doc, csv, fakeMeasure);
    expect(r.fatal).toBeNull();
    expect(r.rows.map((v) => v.status)).toEqual(["ok", "error", "warning"]);
  });
  it("flags a name too long to fit even at the minimum size", () => {
    const r = checkCsv(doc, `number,name\n5,${"W".repeat(400)}\n`, fakeMeasure);
    expect(r.rows[0].status).toBe("error");
  });
  it("writes safe CSV", () => {
    expect(toCsv([["a,b", '"q"', "=SUM(A1)", -5]])).toBe('"a,b","""q""",\'=SUM(A1),-5\r\n');
  });
});

describe("Xero export", () => {
  it("exports one row per line with VAT tax type", async () => {
    const out = await xeroCsvAdapter.exportInvoices([{ number: "DH-001001", paidAt: "2026-11-17T10:00:00Z", customerName: "Peak Trail Events", email: "a@b.test", currency: "GBP", vatRate: 0.2, lines: [{ description: "Race bibs", amountPence: 5941 }] }]);
    const lines = out.body.trim().split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe("Peak Trail Events,a@b.test,DH-001001,DH-001001,17/11/2026,17/11/2026,Race bibs,1,59.41,200,20% (VAT on Income),GBP");
  });
});
