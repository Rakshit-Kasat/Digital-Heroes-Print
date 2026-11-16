/**
 * Server-side font access: the same TTF files the browser loads via @font-face.
 * Loaded once per server instance and cached in memory.
 */
import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { FONTS, fontFile } from "@/lib/design/fonts";
import type { FontId } from "@/lib/design/types";
import type { Measure } from "@/lib/layout/fitText";

export const FONT_DIR = join(process.cwd(), "public", "fonts");

const bytesCache = new Map<string, Buffer>();
export function fontBytes(id: FontId, bold: boolean): Buffer {
  const file = fontFile(id, bold);
  let b = bytesCache.get(file);
  if (!b) { b = readFileSync(join(FONT_DIR, file)); bytesCache.set(file, b); }
  return b;
}

type FKFont = ReturnType<typeof fontkit.create>;
const fkCache = new Map<string, FKFont>();
function fkFont(id: FontId, bold: boolean): FKFont {
  const file = fontFile(id, bold);
  let f = fkCache.get(file);
  if (!f) { f = fontkit.create(fontBytes(id, bold)); fkCache.set(file, f); }
  return f;
}

/** Measures with the real font outlines (kerning included). */
export const serverMeasure: Measure = (text, font, bold, sizeMm) => {
  const f = fkFont(font, bold);
  return (f.layout(text).advanceWidth / f.unitsPerEm) * sizeMm;
};

/** Absolute paths of every font file, for resvg. */
export function allFontPaths(): string[] {
  return [...new Set(Object.values(FONTS).flatMap((f) => [f.files.normal, f.files.bold].filter(Boolean) as string[]))].map((f) => join(FONT_DIR, f));
}
