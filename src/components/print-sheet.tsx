/**
 * Server-rendered print preview: the real engine output (fontkit-measured,
 * same as the PDF), optionally framed with crop marks and millimetre
 * callouts so the customer sees trim, bleed and safe area at a glance.
 */
import "server-only";
import { layoutForPrint } from "@/lib/print/render";
import { toSvg } from "@/lib/design/svg";
import type { DesignDoc } from "@/lib/design/types";

export function renderDocSvg(doc: DesignDoc, guides = false, resolveImage?: (s: string) => string) {
  return toSvg(layoutForPrint(doc), { guides, resolveImage });
}

export function PrintArt({ doc, className, label }: { doc: DesignDoc; className?: string; label: string }) {
  const svg = renderDocSvg(doc).replace("<svg ", `<svg role="img" aria-label="${label.replace(/"/g, "")}" style="width:100%;height:auto;display:block" `);
  // Safe: toSvg escapes every text value; the markup is produced by our own renderer.
  return <div className={className} dangerouslySetInnerHTML={{ __html: svg }} />;
}

/** The hero "sheet": artwork with crop marks and dimension callouts. */
export function AnnotatedSheet({ doc, label }: { doc: DesignDoc; label: string }) {
  const W = doc.widthMm, H = doc.heightMm, b = doc.bleedMm;
  const pad = 22; // mm of margin for marks and callouts
  const inner = renderDocSvg(doc, true)
    .replace(/^<svg [^>]*?viewBox="([^"]+)"[^>]*>/, (_m, vb) => `<svg x="${pad - b}" y="${pad - b}" width="${W + 2 * b}" height="${H + 2 * b}" viewBox="${vb}">`);
  const ox = pad, oy = pad, x2 = pad + W, y2 = pad + H;
  const mark = (x1: number, y1: number, xb: number, yb: number) => `<line x1="${x1}" y1="${y1}" x2="${xb}" y2="${yb}" stroke="#1B1F24" stroke-width="0.35"/>`;
  const marks = [
    mark(ox - b - 2, oy, ox - b - 12, oy), mark(ox, oy - b - 2, ox, oy - b - 12),
    mark(x2 + b + 2, oy, x2 + b + 12, oy), mark(x2, oy - b - 2, x2, oy - b - 12),
    mark(ox - b - 2, y2, ox - b - 12, y2), mark(ox, y2 + b + 2, ox, y2 + b + 12),
    mark(x2 + b + 2, y2, x2 + b + 12, y2), mark(x2, y2 + b + 2, x2, y2 + b + 12),
  ].join("");
  const text = (x: number, y: number, s: string, anchor = "middle", rotate = 0) =>
    `<text x="${x}" y="${y}" style="font-family:var(--font-red-hat-text),sans-serif" font-size="4.2" font-weight="600" fill="#5B6470" text-anchor="${anchor}"${rotate ? ` transform="rotate(${rotate} ${x} ${y})"` : ""}>${s}</text>`;
  const dims = [
    `<line x1="${ox}" y1="${y2 + 16}" x2="${x2}" y2="${y2 + 16}" stroke="#5B6470" stroke-width="0.3" marker-start="url(#tick)" marker-end="url(#tick)"/>`,
    text((ox + x2) / 2, y2 + 21.5, `${W} mm trim`),
    `<line x1="${x2 + 16}" y1="${oy}" x2="${x2 + 16}" y2="${y2}" stroke="#5B6470" stroke-width="0.3" marker-start="url(#tick)" marker-end="url(#tick)"/>`,
    text(x2 + 20.5, (oy + y2) / 2, `${H} mm`, "middle", 90),
    text(ox - b, oy - b - 4, `${b} mm bleed`, "start"),
    text(x2 - doc.safeMm, oy + doc.safeMm + 5.5, "safe area", "end").replace('fill="#5B6470"', 'fill="#C4105F"'),
  ].join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W + 2 * pad} ${H + 2 * pad}" role="img" aria-label="${label}" style="width:100%;height:auto;display:block">
    <defs><marker id="tick" viewBox="0 0 2 8" refX="1" refY="4" markerWidth="2" markerHeight="8" orient="auto"><path d="M1 0V8" stroke="#5B6470" stroke-width="0.6"/></marker></defs>
    <rect x="${ox - b}" y="${oy - b}" width="${W + 2 * b}" height="${H + 2 * b}" fill="#fff" class="sheet"/>${inner}${marks}${dims}</svg>`;
  return <div dangerouslySetInnerHTML={{ __html: svg }} />;
}
