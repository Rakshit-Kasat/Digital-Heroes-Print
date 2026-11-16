/**
 * Display list -> SVG. Used for the live preview in the browser, for the
 * proof image the customer approves, and (via resvg) for the print PNG.
 * Coordinates are millimetres; the viewBox spans the bleed box.
 *
 * svgNodes() builds a small tree once; toSvg() turns it into a string
 * (server, proofs) and the designer turns the SAME tree into React
 * elements. One source of truth, so the editor cannot drift from the proof.
 */
import { FONTS } from "./fonts";
import type { Layout } from "./layout";

export interface SvgOptions {
  guides?: boolean;                       // trim + safe-area lines (preview only, never printed)
  resolveImage?: (src: string) => string; // storage path -> data: URL (server) or signed URL (browser)
}

export interface SvgNode { tag: string; key: string; attrs: Record<string, string>; children?: Array<SvgNode | string> }

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const n = (v: number) => (Math.round(v * 1000) / 1000).toString();

export function svgRoot(layout: Layout) {
  const { widthMm: W, heightMm: H, bleedMm: b } = layout.doc;
  return { width: `${n(W + 2 * b)}mm`, height: `${n(H + 2 * b)}mm`, viewBox: `${n(-b)} ${n(-b)} ${n(W + 2 * b)} ${n(H + 2 * b)}` };
}

export function svgNodes(layout: Layout, opts: SvgOptions = {}): SvgNode[] {
  const { doc, items } = layout;
  const b = doc.bleedMm, W = doc.widthMm, H = doc.heightMm;
  const out: SvgNode[] = [{ tag: "rect", key: "bg", attrs: { x: n(-b), y: n(-b), width: n(W + 2 * b), height: n(H + 2 * b), fill: doc.background } }];

  for (const it of items) {
    const cx = it.x + it.w / 2, cy = it.y + it.h / 2;
    const tf: Record<string, string> = it.rotation ? { transform: `rotate(${n(it.rotation)} ${n(cx)} ${n(cy)})` } : {};
    if (it.kind === "rect" || it.kind === "ellipse") {
      const paint: Record<string, string> = { fill: it.fill === "none" ? "none" : it.fill, ...(it.stroke ? { stroke: it.stroke, "stroke-width": n(it.strokeWidth ?? 0.3) } : {}) };
      out.push(it.kind === "rect"
        ? { tag: "rect", key: it.id, attrs: { x: n(it.x), y: n(it.y), width: n(it.w), height: n(it.h), ...(it.radius ? { rx: n(it.radius) } : {}), ...paint, ...tf } }
        : { tag: "ellipse", key: it.id, attrs: { cx: n(cx), cy: n(cy), rx: n(it.w / 2), ry: n(it.h / 2), ...paint, ...tf } });
    } else if (it.kind === "image") {
      const href = opts.resolveImage ? opts.resolveImage(it.src) : it.src;
      out.push({ tag: "image", key: it.id, attrs: { x: n(it.x), y: n(it.y), width: n(it.w), height: n(it.h), preserveAspectRatio: "xMidYMid meet", href, ...tf } });
    } else {
      const f = FONTS[it.font];
      out.push({
        tag: "text", key: it.id,
        attrs: { "font-family": f.family, "font-weight": it.bold ? "700" : "400", "font-size": n(it.sizeMm), fill: it.color, ...(it.trackingMm ? { "letter-spacing": n(it.trackingMm) } : {}), "xml:space": "preserve", ...tf },
        children: it.lines.map((l, i) => ({ tag: "tspan", key: String(i), attrs: { x: n(l.x), y: n(l.baseline) }, children: [l.text] })),
      });
    }
  }

  if (opts.guides) {
    const s = doc.safeMm;
    const guide = { fill: "none", "stroke-width": "0.25", "vector-effect": "non-scaling-stroke" };
    out.push({ tag: "rect", key: "trim", attrs: { x: "0", y: "0", width: n(W), height: n(H), stroke: "#1B1F24", "stroke-dasharray": "1.5 1", ...guide } });
    if (s > 0) out.push({ tag: "rect", key: "safe", attrs: { x: n(s), y: n(s), width: n(W - 2 * s), height: n(H - 2 * s), stroke: "#C4105F", "stroke-dasharray": "0.8 0.8", ...guide } });
  }
  return out;
}

function serialise(node: SvgNode | string): string {
  if (typeof node === "string") return esc(node);
  let attrs = Object.entries(node.attrs).map(([k, v]) => ` ${k}="${esc(v)}"`).join("");
  // resvg and older viewers still want xlink:href on images.
  if (node.tag === "image") attrs += ` xlink:href="${esc(node.attrs.href)}"`;
  return node.children ? `<${node.tag}${attrs}>${node.children.map(serialise).join("")}</${node.tag}>` : `<${node.tag}${attrs}/>`;
}

export function toSvg(layout: Layout, opts: SvgOptions = {}): string {
  const r = svgRoot(layout);
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${r.width}" height="${r.height}" viewBox="${r.viewBox}">${svgNodes(layout, opts).map(serialise).join("")}</svg>`;
}
