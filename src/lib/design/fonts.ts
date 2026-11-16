/**
 * Font registry. The same TTF files (public/fonts) are used by the browser
 * (@font-face) and by the server renderer, so measurements and shapes match.
 * All fonts are SIL Open Font Licence (Google Fonts).
 */
import type { FontId } from "./types";

export interface FontDef {
  family: string; // must equal the font's internal family name (for resvg)
  label: string;
  files: { normal: string; bold?: string };
  ascent: number;  // hhea ascent / unitsPerEm (measured with fontkit)
  descent: number; // |hhea descent| / unitsPerEm
  cap: number;     // cap height / unitsPerEm: text boxes are fitted to cap height + descent
}

export const FONTS: Record<FontId, FontDef> = {
  lato:    { family: "Lato",          label: "Lato (clean sans)",      files: { normal: "Lato-Regular.ttf", bold: "Lato-Bold.ttf" }, ascent: 0.987, descent: 0.213, cap: 0.72 },
  anton:   { family: "Anton",         label: "Anton (race numbers)",   files: { normal: "Anton-Regular.ttf" }, ascent: 1.176, descent: 0.329, cap: 0.859 },
  archivo: { family: "Archivo Black", label: "Archivo Black (labels)", files: { normal: "ArchivoBlack-Regular.ttf" }, ascent: 0.878, descent: 0.21, cap: 0.688 },
  alfa:    { family: "Alfa Slab One", label: "Alfa Slab (signage)",    files: { normal: "AlfaSlabOne-Regular.ttf" }, ascent: 1.036, descent: 0.333, cap: 0.778 },
  vibes:   { family: "Great Vibes",   label: "Great Vibes (script)",   files: { normal: "GreatVibes-Regular.ttf" }, ascent: 0.851, descent: 0.401, cap: 0.75 },
  courier: { family: "Courier Prime", label: "Courier Prime (stamps)", files: { normal: "CourierPrime-Regular.ttf", bold: "CourierPrime-Bold.ttf" }, ascent: 0.781, descent: 0.342, cap: 0.58 },
};

export const FONT_IDS = Object.keys(FONTS) as FontId[];

/** File name for a font + weight, falling back to regular when no bold cut exists. */
export function fontFile(id: FontId, bold?: boolean): string {
  const f = FONTS[id].files;
  return bold && f.bold ? f.bold : f.normal;
}

export const PT_TO_MM = 0.352778;
