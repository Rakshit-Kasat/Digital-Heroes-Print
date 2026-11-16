"use client";
/**
 * Browser text measurement for the shared layout engine. Uses canvas
 * measureText with the same TTF files (@font-face in globals.css) that the
 * server measures with fontkit, so fitted sizes agree.
 */
import { useEffect, useState } from "react";
import { FONTS } from "./fonts";
import type { Measure } from "@/lib/layout/fitText";

let ctx: CanvasRenderingContext2D | null = null;
const cache = new Map<string, number>();

export const clientMeasure: Measure = (text, font, bold, sizeMm) => {
  const key = `${font}|${bold ? 1 : 0}|${text}`;
  let w100 = cache.get(key);
  if (w100 === undefined) {
    ctx ??= document.createElement("canvas").getContext("2d");
    if (!ctx) return text.length * 0.55 * sizeMm;
    ctx.font = `${bold ? 700 : 400} 100px "${FONTS[font].family}"`;
    w100 = ctx.measureText(text).width / 100; // width in em
    if (cache.size > 5000) cache.clear();
    cache.set(key, w100);
  }
  return w100 * sizeMm;
};

let loading: Promise<void> | null = null;
function loadPrintFonts(): Promise<void> {
  loading ??= Promise.all(
    Object.values(FONTS).flatMap((f) => [document.fonts.load(`400 100px "${f.family}"`), ...(f.files.bold ? [document.fonts.load(`700 100px "${f.family}"`)] : [])]),
  ).then(() => { cache.clear(); });
  return loading;
}

/** True once every print font is loaded (measurements before that would be wrong). */
export function usePrintFonts(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    loadPrintFonts().then(() => alive && setReady(true), () => alive && setReady(true));
    return () => { alive = false; };
  }, []);
  return ready;
}
