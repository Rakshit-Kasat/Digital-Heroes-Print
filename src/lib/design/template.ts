/**
 * Templates are stored size-independently (fractions of the trim), so one
 * template serves every size the customer configures. This turns a template
 * into a concrete DesignDoc in millimetres for a given size.
 */
import { PT_TO_MM } from "./fonts";
import type { DesignDoc, DesignElement, TemplateDoc } from "./types";

export function instantiateTemplate(
  tpl: TemplateDoc,
  size: { widthMm: number; heightMm: number },
  product: { bleed_mm: number; safe_mm: number },
): DesignDoc {
  const W = size.widthMm, H = size.heightMm, bleed = Number(product.bleed_mm);
  const r2 = (n: number) => Math.round(n * 100) / 100;

  const elements = tpl.elements.map((src): DesignElement => {
    let x = src.x * W, y = src.y * H, w = src.w * W, h = src.h * H;
    // Furniture touching the trim edge (colour bands) runs out into the bleed,
    // so a slightly-off guillotine cut never leaves a white sliver.
    if (src.type !== "text" && src.locked) {
      if (src.x <= 0) { x -= bleed; w += bleed; }
      if (src.y <= 0) { y -= bleed; h += bleed; }
      if (src.x + src.w >= 1) w += bleed;
      if (src.y + src.h >= 1) h += bleed;
    }
    const base = { ...src, x: r2(x), y: r2(y), w: r2(w), h: r2(h) };
    if (src.type === "text") return { ...base, type: "text", size: r2((src.size * H) / PT_TO_MM) } as DesignElement;
    return base as DesignElement;
  });

  return { version: 1, widthMm: W, heightMm: H, bleedMm: bleed, safeMm: Number(product.safe_mm), background: tpl.background, elements };
}

/** A blank document for "start from scratch". */
export function blankDesign(size: { widthMm: number; heightMm: number }, product: { bleed_mm: number; safe_mm: number }): DesignDoc {
  return { version: 1, widthMm: size.widthMm, heightMm: size.heightMm, bleedMm: Number(product.bleed_mm), safeMm: Number(product.safe_mm), background: "#ffffff", elements: [] };
}

/** An uploaded PNG/SVG artwork becomes a one-image document filling the bleed box. */
export function uploadDesign(
  src: string,
  size: { widthMm: number; heightMm: number },
  product: { bleed_mm: number; safe_mm: number },
): DesignDoc {
  const b = Number(product.bleed_mm);
  return {
    ...blankDesign(size, product),
    elements: [{ id: "artwork", type: "image", src, x: -b, y: -b, w: size.widthMm + 2 * b, h: size.heightMm + 2 * b, rotation: 0, locked: true }],
  };
}

/** Variable data: replace each text element bound to a CSV column. */
export function applyRow(doc: DesignDoc, row: Record<string, string>): DesignDoc {
  const lookup = new Map(Object.entries(row).map(([k, v]) => [k.trim().toLowerCase(), v]));
  return {
    ...doc,
    elements: doc.elements.map((el) =>
      el.type === "text" && el.field && lookup.has(el.field.toLowerCase())
        ? { ...el, text: lookup.get(el.field.toLowerCase())!.trim() }
        : el,
    ),
  };
}

/** The CSV columns a design expects (its text elements' `field` names). */
export function designFields(doc: DesignDoc): string[] {
  return [...new Set(doc.elements.flatMap((e) => (e.type === "text" && e.field ? [e.field] : [])))];
}
