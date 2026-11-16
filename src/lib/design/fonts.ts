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
}

export const FONTS: Record<FontId, FontDef> = {
  lato:    { family: "Lato",          label: "Lato (clean sans)",      files: { normal: "Lato-Regular.ttf", bold: "Lato-Bold.ttf" } },
  anton:   { family: "Anton",         label: "Anton (race numbers)",   files: { normal: "Anton-Regular.ttf" } },
  archivo: { family: "Archivo Black", label: "Archivo Black (labels)", files: { normal: "ArchivoBlack-Regular.ttf" } },
  alfa:    { family: "Alfa Slab One", label: "Alfa Slab (signage)",    files: { normal: "AlfaSlabOne-Regular.ttf" } },
  vibes:   { family: "Great Vibes",   label: "Great Vibes (script)",   files: { normal: "GreatVibes-Regular.ttf" } },
  courier: { family: "Courier Prime", label: "Courier Prime (stamps)", files: { normal: "CourierPrime-Regular.ttf", bold: "CourierPrime-Bold.ttf" } },
};

export const FONT_IDS = Object.keys(FONTS) as FontId[];

/** File name for a font + weight, falling back to regular when no bold cut exists. */
export function fontFile(id: FontId, bold?: boolean): string {
  const f = FONTS[id].files;
  return bold && f.bold ? f.bold : f.normal;
}

export const PT_TO_MM = 0.352778;
