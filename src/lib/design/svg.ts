/**
 * Display list -> SVG. Used for the live preview in the browser, for the
 * proof image the customer approves, and (via resvg) for the print PNG.
 * Coordinates are millimetres; the viewBox spans the bleed box.
 */
import { FONTS } from "./fonts";
import type { Layout } from "./layout";

export interface SvgOptions {
  guides?: boolean;                       // trim + safe-area lines (preview only, never printed)
  resolveImage?: (src: string) => string; // storage path -> data: URL (server) or signed URL (browser)
  idPrefix?: string;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const n = (v: number) => (Math.round(v * 1000) / 1000).toString();

export function toSvg(layout: Layout, opts: SvgOptions = {}): string {
  const { doc, items } = layout;
  const b = doc.bleedMm, W = doc.widthMm, H = doc.heightMm;
  const out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${n(W + 2 * b)}mm" height="${n(H + 2 * b)}mm" viewBox="${n(-b)} ${n(-b)} ${n(W + 2 * b)} ${n(H + 2 * b)}">`);
  out.push(`<rect x="${n(-b)}" y="${n(-b)}" width="${n(W + 2 * b)}" height="${n(H + 2 * b)}" fill="${esc(doc.background)}"/>`);

  for (const it of items) {
    const cx = it.x + it.w / 2, cy = it.y + it.h / 2;
    const tf = it.rotation ? ` transform="rotate(${n(it.rotation)} ${n(cx)} ${n(cy)})"` : "";
    if (it.kind === "rect" || it.kind === "ellipse") {
      const paint = `fill="${it.fill === "none" ? "none" : esc(it.fill)}"${it.stroke ? ` stroke="${esc(it.stroke)}" stroke-width="${n(it.strokeWidth ?? 0.3)}"` : ""}`;
      out.push(it.kind === "rect"
        ? `<rect x="${n(it.x)}" y="${n(it.y)}" width="${n(it.w)}" height="${n(it.h)}"${it.radius ? ` rx="${n(it.radius)}"` : ""} ${paint}${tf}/>`
        : `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(it.w / 2)}" ry="${n(it.h / 2)}" ${paint}${tf}/>`);
    } else if (it.kind === "image") {
      const href = opts.resolveImage ? opts.resolveImage(it.src) : it.src;
      out.push(`<image x="${n(it.x)}" y="${n(it.y)}" width="${n(it.w)}" height="${n(it.h)}" preserveAspectRatio="xMidYMid meet" href="${esc(href)}" xlink:href="${esc(href)}"${tf}/>`);
    } else {
      const f = FONTS[it.font];
      const attrs = `font-family="${esc(f.family)}" font-weight="${it.bold ? 700 : 400}" font-size="${n(it.sizeMm)}" fill="${esc(it.color)}"${it.trackingMm ? ` letter-spacing="${n(it.trackingMm)}"` : ""}`;
      const spans = it.lines.map((l) => `<tspan x="${n(l.x)}" y="${n(l.baseline)}">${esc(l.text)}</tspan>`).join("");
      out.push(`<text ${attrs} xml:space="preserve"${tf}>${spans}</text>`);
    }
  }

  if (opts.guides) {
    const s = doc.safeMm;
    out.push(`<rect x="0" y="0" width="${n(W)}" height="${n(H)}" fill="none" stroke="#1B1F24" stroke-width="0.25" stroke-dasharray="1.5 1" vector-effect="non-scaling-stroke"/>`);
    if (s > 0) out.push(`<rect x="${n(s)}" y="${n(s)}" width="${n(W - 2 * s)}" height="${n(H - 2 * s)}" fill="none" stroke="#C4105F" stroke-width="0.25" stroke-dasharray="0.8 0.8" vector-effect="non-scaling-stroke"/>`);
  }
  out.push("</svg>");
  return out.join("");
}
