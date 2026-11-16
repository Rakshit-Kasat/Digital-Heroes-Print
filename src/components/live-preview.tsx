"use client";
/**
 * Live preview in the browser: the SAME layout engine as the server, fed
 * by canvas text measurement. Re-renders on every configuration change.
 */
import { useMemo } from "react";
import { layoutDesign } from "@/lib/design/layout";
import { toSvg } from "@/lib/design/svg";
import { clientMeasure, usePrintFonts } from "@/lib/design/measure.client";
import type { DesignDoc } from "@/lib/design/types";

export function LivePreview({ doc, guides = true, label, imageUrls }: { doc: DesignDoc; guides?: boolean; label: string; imageUrls?: Record<string, string> }) {
  const ready = usePrintFonts();
  const svg = useMemo(() => {
    if (!ready) return "";
    const layout = layoutDesign(doc, clientMeasure);
    return toSvg(layout, { guides, resolveImage: (s) => imageUrls?.[s] ?? s })
      .replace("<svg ", `<svg role="img" aria-label="${label.replace(/"/g, "")}" style="width:100%;height:auto;display:block;max-height:100%" `);
  }, [doc, guides, label, ready, imageUrls]);
  if (!ready) return <div className="aspect-[4/3] w-full animate-pulse rounded bg-mist" aria-label="Loading preview" />;
  return <div className="sheet-shadow bg-sheet" dangerouslySetInnerHTML={{ __html: svg }} />;
}
