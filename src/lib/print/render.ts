/**
 * Print-file engine (PRD §07), server only.
 *
 *  - PDF: VECTOR, drawn from the shared display list with pdf-lib. Fonts are
 *    embedded (subset), text stays sharp at any resolution, files stay small.
 *    Page = bleed box + a slug margin carrying crop marks; TrimBox and
 *    BleedBox are set so prepress software knows the cut line.
 *  - PNG: the proof SVG rasterised by resvg at the product's dpi (300 or 600),
 *    capped so a huge laser sign cannot exhaust serverless memory.
 *  - SVG: the vector artwork itself (laser cutters and stamp makers use it).
 */
import "server-only";
import { Resvg } from "@resvg/resvg-js";
import {
  PDFDocument, rgb, StandardFonts, pushGraphicsState, popGraphicsState, concatTransformationMatrix,
  setCharacterSpacing, rectangle, clip, endPath, type PDFFont, type PDFImage, type PDFPage,
} from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { allFontPaths, fontBytes, serverMeasure } from "./fonts.server";
import { layoutDesign, type Item, type Layout } from "@/lib/design/layout";
import { toSvg } from "@/lib/design/svg";
import type { DesignDoc, FontId } from "@/lib/design/types";

export interface ImageAsset { bytes: Uint8Array; mime: string }
export type ImageMap = Map<string, ImageAsset>;

const MM_TO_PT = 72 / 25.4;
const SLUG_MM = 12;         // margin around the bleed for crop marks
const MAX_PIXELS = 60e6;    // PNG safety cap (~60 MP)

export function layoutForPrint(doc: DesignDoc): Layout {
  return layoutDesign(doc, serverMeasure);
}

const toDataUrl = (a: ImageAsset) => `data:${a.mime};base64,${Buffer.from(a.bytes).toString("base64")}`;

/** SVG with images inlined, ready for resvg or for storing as a vector file. */
export function svgForPrint(layout: Layout, images: ImageMap, guides = false): string {
  return toSvg(layout, { guides, resolveImage: (src) => { const a = images.get(src); return a ? toDataUrl(a) : src; } });
}

export function renderPng(layout: Layout, images: ImageMap, dpi: number, opts: { guides?: boolean } = {}): { png: Buffer; dpi: number } {
  const { doc } = layout;
  const inW = (doc.widthMm + 2 * doc.bleedMm) / 25.4, inH = (doc.heightMm + 2 * doc.bleedMm) / 25.4;
  const effective = Math.min(dpi, Math.floor(Math.sqrt(MAX_PIXELS / (inW * inH))));
  const resvg = new Resvg(svgForPrint(layout, images, opts.guides), {
    fitTo: { mode: "width", value: Math.round(inW * effective) },
    font: { fontFiles: allFontPaths(), loadSystemFonts: false, defaultFontFamily: "Lato" },
    background: "#ffffff",
  });
  return { png: resvg.render().asPng(), dpi: effective };
}

/** Hex "#rrggbb" -> pdf-lib colour. */
function color(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const v = m ? parseInt(m[1], 16) : 0;
  return rgb(((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255);
}

function roundedRectPath(w: number, h: number, r: number): string {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  if (!r) return `M0 0 H${w} V${h} H0 Z`;
  return `M${r} 0 H${w - r} A${r} ${r} 0 0 1 ${w} ${r} V${h - r} A${r} ${r} 0 0 1 ${w - r} ${h} H${r} A${r} ${r} 0 0 1 0 ${h - r} V${r} A${r} ${r} 0 0 1 ${r} 0 Z`;
}

function ellipsePath(w: number, h: number): string {
  const rx = w / 2, ry = h / 2;
  return `M0 ${ry} A${rx} ${ry} 0 1 0 ${w} ${ry} A${rx} ${ry} 0 1 0 0 ${ry} Z`;
}

/**
 * Coordinate system while drawing: millimetres, origin at the TRIM top-left,
 * y pointing UP (PDF native) — so an element at y mm is drawn at -y.
 * Rotation is applied about the element centre, clockwise like SVG.
 */
function withRotation(page: PDFPage, it: Item, draw: () => void) {
  if (!it.rotation) return draw();
  const r = (it.rotation * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  const tx = it.x + it.w / 2, ty = -(it.y + it.h / 2);
  page.pushOperators(pushGraphicsState(), concatTransformationMatrix(c, -s, s, c, tx - (c * tx + s * ty), ty - (-s * tx + c * ty)));
  draw();
  page.pushOperators(popGraphicsState());
}

async function embedImage(pdf: PDFDocument, asset: ImageAsset, wMm: number, hMm: number): Promise<PDFImage | null> {
  if (asset.mime === "image/png") return pdf.embedPng(asset.bytes);
  if (asset.mime === "image/jpeg") return pdf.embedJpg(asset.bytes);
  if (asset.mime === "image/svg+xml") {
    // Vector logo -> rasterise at 600 dpi for the box it occupies.
    const px = Math.max(64, Math.round((Math.max(wMm, hMm) / 25.4) * 600));
    const png = new Resvg(Buffer.from(asset.bytes), { fitTo: { mode: "width", value: Math.min(px, 8000) }, font: { loadSystemFonts: false, fontFiles: allFontPaths() } }).render().asPng();
    return pdf.embedPng(png);
  }
  return null;
}

export interface PdfMeta { title: string; slugLine: string }

/** Adds one page for `layout` to `pdf` (so CSV merges can share a document's fonts if wanted). */
export async function drawPdfPage(pdf: PDFDocument, layout: Layout, images: ImageMap, meta: PdfMeta, fontCache = new Map<string, PDFFont>()) {
  const { doc, items } = layout;
  const W = doc.widthMm, H = doc.heightMm, b = doc.bleedMm;
  const pageW = W + 2 * b + 2 * SLUG_MM, pageH = H + 2 * b + 2 * SLUG_MM;
  const page = pdf.addPage([pageW * MM_TO_PT, pageH * MM_TO_PT]);
  const off = SLUG_MM + b; // trim origin offset from the page corner, in mm
  page.setTrimBox(off * MM_TO_PT, off * MM_TO_PT, W * MM_TO_PT, H * MM_TO_PT);
  page.setBleedBox(SLUG_MM * MM_TO_PT, SLUG_MM * MM_TO_PT, (W + 2 * b) * MM_TO_PT, (H + 2 * b) * MM_TO_PT);

  const font = async (id: FontId, bold: boolean) => {
    const key = `${id}:${bold}`;
    let f = fontCache.get(key);
    if (!f) { f = await pdf.embedFont(fontBytes(id, bold), { subset: true }); fontCache.set(key, f); }
    return f;
  };

  // Enter mm space: origin at trim top-left, y up.
  page.pushOperators(
    pushGraphicsState(),
    concatTransformationMatrix(MM_TO_PT, 0, 0, MM_TO_PT, off * MM_TO_PT, (off + H) * MM_TO_PT),
    rectangle(-b, -(H + b), W + 2 * b, H + 2 * b), clip(), endPath(), // nothing prints past the bleed
  );
  page.drawRectangle({ x: -b, y: -(H + b), width: W + 2 * b, height: H + 2 * b, color: color(doc.background) });

  for (const it of items) {
    if (it.kind === "rect" || it.kind === "ellipse") {
      const path = it.kind === "rect" ? roundedRectPath(it.w, it.h, it.radius ?? 0) : ellipsePath(it.w, it.h);
      withRotation(page, it, () =>
        page.drawSvgPath(path, {
          x: it.x, y: -it.y, // drawSvgPath flips y itself, so path coords stay y-down
          ...(it.fill !== "none" ? { color: color(it.fill) } : {}),
          ...(it.stroke ? { borderColor: color(it.stroke), borderWidth: it.strokeWidth ?? 0.3 } : {}),
        }));
    } else if (it.kind === "image") {
      const asset = images.get(it.src);
      const img = asset ? await embedImage(pdf, asset, it.w, it.h) : null;
      if (!img) continue;
      // "contain" inside the box, centred, like preserveAspectRatio=meet.
      const scale = Math.min(it.w / img.width, it.h / img.height);
      const w = img.width * scale, h = img.height * scale;
      withRotation(page, it, () => page.drawImage(img, { x: it.x + (it.w - w) / 2, y: -(it.y + (it.h + h) / 2), width: w, height: h }));
    } else {
      const f = await font(it.font, it.bold);
      withRotation(page, it, () => {
        page.pushOperators(pushGraphicsState(), setCharacterSpacing(it.trackingMm));
        for (const line of it.lines) page.drawText(line.text, { x: line.x, y: -line.baseline, size: it.sizeMm, font: f, color: color(it.color) });
        page.pushOperators(popGraphicsState());
      });
    }
  }
  page.pushOperators(popGraphicsState());

  // Crop marks in the slug: registration black, 0.25 pt, starting 2 mm outside the bleed.
  const mark = (x1: number, y1: number, x2: number, y2: number) =>
    page.drawLine({ start: { x: x1 * MM_TO_PT, y: y1 * MM_TO_PT }, end: { x: x2 * MM_TO_PT, y: y2 * MM_TO_PT }, thickness: 0.25, color: rgb(0, 0, 0) });
  // Each mark runs from 2 mm outside the bleed to 2 mm inside the page edge.
  const from = b + 2, to = off - 2;
  for (const x of [off, off + W]) for (const y of [off, off + H]) {
    const sx = x === off ? -1 : 1, sy = y === off ? -1 : 1;
    mark(x + sx * from, y, x + sx * to, y); // horizontal
    mark(x, y + sy * from, x, y + sy * to); // vertical
  }
  const helv = fontCache.get("helv") ?? (await pdf.embedFont(StandardFonts.Helvetica));
  fontCache.set("helv", helv);
  page.drawText(meta.slugLine, { x: off * MM_TO_PT, y: 4 * MM_TO_PT, size: 6, font: helv, color: rgb(0.3, 0.3, 0.3) });
}

export async function renderPdf(layout: Layout, images: ImageMap, meta: PdfMeta): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setTitle(meta.title);
  pdf.setProducer("Digital Heroes print engine");
  await drawPdfPage(pdf, layout, images, meta);
  return pdf.save();
}

/** PRD §07 naming: OrderID_ProductType_Date_Output, filesystem-safe. */
export function printFileName(orderNumber: string, productSlug: string, date: Date, output: string, ext: string): string {
  const d = date.toISOString().slice(0, 10).replace(/-/g, "");
  const safe = (s: string) => s.replace(/[^A-Za-z0-9-]+/g, "-").replace(/^-|-$/g, "");
  return `${safe(orderNumber)}_${safe(productSlug)}_${d}_${safe(output)}.${ext}`;
}
