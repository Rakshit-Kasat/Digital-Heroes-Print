/**
 * THE shared layout engine. A DesignDoc goes in; a flat "display list" of
 * positioned primitives comes out, with every text line already fitted and
 * placed. Serialisers (SVG for previews and proofs, PDF for print) only draw
 * what this produces, so the proof and the print file cannot disagree.
 *
 * It also returns preflight warnings (overflowing text, elements outside the
 * safe area, low-resolution images) shown to the customer before approval.
 */
import { FONTS } from "./fonts";
import { fitText, type Measure } from "@/lib/layout/fitText";
import { isInside, printArea } from "@/lib/layout/constrain";
import type { DesignDoc, FontId } from "./types";

interface Placed { id: string; x: number; y: number; w: number; h: number; rotation: number }
export type Item =
  | (Placed & { kind: "rect"; fill: string; stroke?: string; strokeWidth?: number; radius?: number })
  | (Placed & { kind: "ellipse"; fill: string; stroke?: string; strokeWidth?: number })
  | (Placed & { kind: "image"; src: string })
  | (Placed & {
      kind: "text";
      font: FontId;
      bold: boolean;
      color: string;
      sizeMm: number;
      sizePt: number;
      trackingMm: number;
      lines: Array<{ text: string; x: number; baseline: number }>;
      overflow: boolean;
    });

export interface Warning { elementId: string; level: "error" | "warning"; message: string }
export interface Layout { doc: DesignDoc; items: Item[]; warnings: Warning[] }

export const MIN_IMAGE_DPI = 150;

export function layoutDesign(doc: DesignDoc, measure: Measure): Layout {
  const items: Item[] = [];
  const warnings: Warning[] = [];
  const area = printArea(doc);

  for (const el of doc.elements) {
    const placed = { id: el.id, x: el.x, y: el.y, w: el.w, h: el.h, rotation: el.rotation ?? 0 };
    if (!el.locked && !isInside(placed, area)) {
      warnings.push({ elementId: el.id, level: "error", message: "Sits outside the safe print area and may be trimmed." });
    }

    if (el.type === "text") {
      const fit = fitText(el, measure);
      const f = FONTS[el.font];
      // Centre the text block vertically; first baseline = top + cap height.
      const top = el.y + (el.h - fit.blockHeightMm) / 2;
      const lines = fit.lines.map((line, i) => ({
        text: line.text,
        x: el.align === "left" ? el.x : el.align === "right" ? el.x + el.w - line.width : el.x + (el.w - line.width) / 2,
        baseline: top + f.cap * fit.sizeMm + i * fit.lineHeightMm,
      }));
      if (fit.overflow) {
        warnings.push({ elementId: el.id, level: "error", message: `“${el.text.slice(0, 30)}” does not fit even at ${el.fit?.minPt ?? fit.sizePt} pt. Shorten it or enlarge the box.` });
      } else if (el.fit && fit.sizePt < Math.min(el.size, el.fit.maxPt) * 0.75) {
        warnings.push({ elementId: el.id, level: "warning", message: `“${el.text.slice(0, 30)}” was reduced to ${fit.sizePt} pt to fit.` });
      }
      items.push({ ...placed, kind: "text", font: el.font, bold: !!el.bold, color: el.color, sizeMm: fit.sizeMm, sizePt: fit.sizePt, trackingMm: fit.trackingMm, lines, overflow: fit.overflow });
    } else if (el.type === "image") {
      if (el.pxW && el.pxH) {
        const dpi = Math.min(el.pxW / (el.w / 25.4), el.pxH / (el.h / 25.4));
        if (dpi < MIN_IMAGE_DPI) warnings.push({ elementId: el.id, level: "warning", message: `Image is only ${Math.round(dpi)} dpi at this size; it may print soft (aim for 300).` });
      }
      items.push({ ...placed, kind: "image", src: el.src });
    } else {
      items.push({ ...placed, kind: el.type, fill: el.fill, stroke: el.stroke, strokeWidth: el.strokeWidth, ...(el.type === "rect" ? { radius: el.radius } : {}) } as Item);
    }
  }
  return { doc, items, warnings };
}
