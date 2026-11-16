/**
 * Text fitting (PRD §07 "per-placeholder fitting"): find the largest font
 * size, within the placeholder's min/max, at which the text wraps inside its
 * box. Variable data (a long surname on a race bib) then always fits.
 *
 * The measuring function is injected so the identical algorithm runs in the
 * browser (canvas) and on the server (fontkit, the same TTF files).
 */
import { FONTS, PT_TO_MM } from "@/lib/design/fonts";
import type { FontId, TextElement } from "@/lib/design/types";

/** Advance width in mm of `text` at `sizeMm`, without tracking. */
export type Measure = (text: string, font: FontId, bold: boolean, sizeMm: number) => number;

export const LINE_HEIGHT = 1.15; // line pitch as a multiple of the font size

export interface FitResult {
  sizePt: number;
  sizeMm: number;
  trackingMm: number; // extra space after every character
  lines: Array<{ text: string; width: number }>;
  lineHeightMm: number;
  blockHeightMm: number; // cap height of line 1 down to the descent of the last line
  overflow: boolean;     // true = does not fit even at the minimum size
}

type Fittable = Pick<TextElement, "text" | "font" | "bold" | "size" | "fit" | "w" | "h">;

const EPS = 0.01; // mm tolerance

function layoutAt(el: Fittable, sizePt: number, measure: Measure) {
  const sizeMm = sizePt * PT_TO_MM;
  const trackingMm = ((el.fit?.tracking ?? 0) / 1000) * sizeMm;
  const width = (s: string) => measure(s, el.font, !!el.bold, sizeMm) + s.length * trackingMm;

  // Greedy word wrap; explicit newlines always break.
  const lines: Array<{ text: string; width: number }> = [];
  for (const paragraph of (el.text ?? "").split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) { lines.push({ text: "", width: 0 }); continue; }
    let current = words[0];
    for (const word of words.slice(1)) {
      const candidate = `${current} ${word}`;
      if (width(candidate) <= el.w + EPS) current = candidate;
      else { lines.push({ text: current, width: width(current) }); current = word; }
    }
    lines.push({ text: current, width: width(current) });
  }

  const f = FONTS[el.font];
  const lineHeightMm = LINE_HEIGHT * sizeMm;
  const blockHeightMm = (lines.length - 1) * lineHeightMm + (f.cap + f.descent) * sizeMm;
  const fits = lines.every((l) => l.width <= el.w + EPS) && blockHeightMm <= el.h + EPS;
  return { sizeMm, trackingMm, lines, lineHeightMm, blockHeightMm, fits };
}

export function fitText(el: Fittable, measure: Measure): FitResult {
  const fit = el.fit;
  let size = el.size;
  if (fit) size = Math.min(Math.max(size, fit.minPt), fit.maxPt);

  let best = layoutAt(el, size, measure);
  if (!best.fits && fit?.shrinkToFit) {
    const floor = layoutAt(el, fit.minPt, measure);
    if (!floor.fits) {
      best = floor; // overflow at the legibility floor: flagged, never silently shrunk further
    } else {
      // Binary search the largest size that fits, to 0.1 pt.
      let lo = fit.minPt, hi = size;
      best = floor;
      while (hi - lo > 0.1) {
        const mid = (lo + hi) / 2;
        const attempt = layoutAt(el, mid, measure);
        if (attempt.fits) { lo = mid; best = attempt; } else hi = mid;
      }
      size = lo;
    }
    size = best.sizeMm / PT_TO_MM;
  }

  return {
    sizePt: Math.round(size * 10) / 10,
    sizeMm: best.sizeMm,
    trackingMm: best.trackingMm,
    lines: best.lines,
    lineHeightMm: best.lineHeightMm,
    blockHeightMm: best.blockHeightMm,
    overflow: !best.fits,
  };
}
