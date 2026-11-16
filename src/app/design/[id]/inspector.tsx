"use client";
/**
 * Properties of the selected element (or of the page when nothing is
 * selected). Every change goes through onChange with a "coalesce key", so
 * typing a word is one undo step, not one per letter.
 */
import { FONTS, FONT_IDS } from "@/lib/design/fonts";
import type { DesignDoc, DesignElement, FontId, ShapeElement, TextElement } from "@/lib/design/types";
import { placeBox } from "./canvas";

/** Solid, print-friendly colours; the colour picker covers everything else. */
const SWATCHES = ["#000000", "#ffffff", "#1b1f24", "#6b7280", "#c8102e", "#e35205", "#ffc72c", "#00843d", "#0057b8", "#002f6c", "#6d2077", "#c4105f"];

export function Inspector({ doc, el, csv, onChange, onDelete, onDuplicate, onLayer }: {
  doc: DesignDoc;
  el: DesignElement | null;
  csv: boolean;
  onChange: (patch: Partial<DesignElement> | { background: string }, key: string) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onLayer: (dir: 1 | -1) => void;
}) {
  if (!el) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-steel">Select something on the artwork to edit it, or add text, shapes and images with the buttons above.</p>
        <ColourField label="Background colour" value={doc.background} onChange={(v) => onChange({ background: v }, "bg")} />
      </div>
    );
  }

  // Number fields for exact placement; still constrained to the safe area.
  const geom = (k: "x" | "y" | "w" | "h" | "rotation", v: number) => {
    if (!Number.isFinite(v)) return;
    onChange(placeBox(doc, { x: el.x, y: el.y, w: el.w, h: el.h, rotation: el.rotation, [k]: v }), `geom-${el.id}`);
  };

  return (
    <div className="space-y-5">
      {el.locked ? (
        <p className="rounded-md bg-mist px-3 py-2 text-sm text-steel">Part of the template layout: its position is fixed, but you can change its colour.</p>
      ) : null}

      {el.type === "text" && <TextProps el={el} csv={csv} onChange={onChange} />}
      {(el.type === "rect" || el.type === "ellipse") && <ShapeProps el={el} onChange={onChange} />}
      {el.type === "image" && <p className="text-sm text-steel">{el.pxW ? `${el.pxW} × ${el.pxH} px image.` : "Vector image (sharp at any size)."} Drag a corner to resize; it keeps its proportions.</p>}

      {!el.locked && (
        <fieldset>
          <legend className="label">Position and size (mm)</legend>
          <div className="grid grid-cols-3 gap-2">
            <Num label="X" value={el.x} onChange={(v) => geom("x", v)} />
            <Num label="Y" value={el.y} onChange={(v) => geom("y", v)} />
            <Num label="Angle °" value={el.rotation} onChange={(v) => geom("rotation", v)} />
            <Num label="Width" value={el.w} onChange={(v) => geom("w", v)} />
            <Num label="Height" value={el.h} onChange={(v) => geom("h", v)} />
          </div>
        </fieldset>
      )}

      {!el.locked && (
        <div className="flex flex-wrap gap-2 border-t border-hairline pt-4">
          <button type="button" className="btn-secondary px-3 py-1.5 text-sm" onClick={() => onLayer(1)}>Bring forward</button>
          <button type="button" className="btn-secondary px-3 py-1.5 text-sm" onClick={() => onLayer(-1)}>Send back</button>
          <button type="button" className="btn-secondary px-3 py-1.5 text-sm" onClick={onDuplicate}>Duplicate</button>
          <button type="button" className="btn-quiet text-sm text-danger hover:text-danger" onClick={onDelete}>Delete</button>
        </div>
      )}
    </div>
  );
}

function TextProps({ el, csv, onChange }: { el: TextElement; csv: boolean; onChange: (p: Partial<TextElement>, key: string) => void }) {
  const fit = el.fit ?? { shrinkToFit: false, minPt: 6, maxPt: el.size };
  return (
    <>
      <div>
        <label className="label" htmlFor="prop-text">Text</label>
        <textarea id="prop-text" rows={2} className="field resize-y" value={el.text} onChange={(e) => onChange({ text: e.target.value }, `text-${el.id}`)} />
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <div>
          <label className="label" htmlFor="prop-font">Font</label>
          <select id="prop-font" className="field" value={el.font} onChange={(e) => { const font = e.target.value as FontId; onChange({ font, bold: FONTS[font].files.bold ? el.bold : false }, `font-${el.id}`); }}>
            {FONT_IDS.map((f) => <option key={f} value={f}>{FONTS[f].label}</option>)}
          </select>
        </div>
        <div>
          <span className="label">Weight</span>
          <button type="button" aria-pressed={!!el.bold} disabled={!FONTS[el.font].files.bold} onClick={() => onChange({ bold: !el.bold }, `bold-${el.id}`)} className={`btn-secondary h-[38px] px-3 font-bold ${el.bold ? "border-ink bg-ink text-paper hover:border-ink" : ""}`}>B</button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Num label="Size (pt)" value={el.size} min={2} onChange={(v) => v >= 2 && onChange({ size: v, fit: el.fit ? { ...el.fit, maxPt: v } : undefined }, `size-${el.id}`)} />
        <div>
          <span className="label">Align</span>
          <div className="flex" role="group" aria-label="Text alignment">
            {(["left", "center", "right"] as const).map((a) => (
              <button key={a} type="button" aria-pressed={el.align === a} onClick={() => onChange({ align: a }, `align-${el.id}`)} className={`h-[38px] flex-1 border border-hairline text-sm first:rounded-l-md last:rounded-r-md ${el.align === a ? "bg-ink text-paper" : "bg-sheet hover:bg-mist"}`}>
                {a === "center" ? "Centre" : a[0].toUpperCase() + a.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>
      <ColourField label="Text colour" value={el.color} onChange={(v) => onChange({ color: v }, `color-${el.id}`)} />
      <fieldset className="rounded-md border border-hairline p-3">
        <legend className="px-1 text-sm font-medium">Fitting</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="accent-accent" checked={fit.shrinkToFit} onChange={(e) => onChange({ fit: { ...fit, maxPt: el.size, shrinkToFit: e.target.checked } }, `fit-${el.id}`)} />
          Shrink to fit the box
        </label>
        {fit.shrinkToFit && (
          <div className="mt-2 w-1/2">
            <Num label="Never below (pt)" value={fit.minPt} min={2} onChange={(v) => v >= 2 && onChange({ fit: { ...fit, minPt: Math.min(v, el.size) } }, `minpt-${el.id}`)} />
          </div>
        )}
      </fieldset>
      {csv && (
        <div>
          <label className="label" htmlFor="prop-field">Fill from CSV column</label>
          <input id="prop-field" className="field" placeholder="e.g. name or number" value={el.field ?? ""} maxLength={40}
            onChange={(e) => { const v = e.target.value.replace(/[^A-Za-z0-9 _-]/g, ""); onChange({ field: v || undefined }, `field-${el.id}`); }} />
          <p className="mt-1 text-xs text-steel">Each CSV row replaces this text with the value in that column.</p>
        </div>
      )}
    </>
  );
}

function ShapeProps({ el, onChange }: { el: ShapeElement; onChange: (p: Partial<ShapeElement>, key: string) => void }) {
  return (
    <>
      <ColourField label="Fill" value={el.fill === "none" ? "#ffffff" : el.fill} onChange={(v) => onChange({ fill: v }, `fill-${el.id}`)} />
      {!el.locked && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="accent-accent" checked={el.fill === "none"} onChange={(e) => onChange({ fill: e.target.checked ? "none" : "#1b1f24", stroke: e.target.checked ? el.stroke ?? "#1b1f24" : el.stroke }, `nofill-${el.id}`)} />
          Outline only
        </label>
      )}
      {!el.locked && (
        <div className="grid grid-cols-2 gap-2">
          <Num label="Outline (mm)" value={el.strokeWidth ?? 0} min={0} step={0.1} onChange={(v) => v >= 0 && onChange({ strokeWidth: v, stroke: v > 0 ? el.stroke ?? "#1b1f24" : undefined }, `sw-${el.id}`)} />
          {el.type === "rect" && <Num label="Corner radius (mm)" value={el.radius ?? 0} min={0} step={0.5} onChange={(v) => v >= 0 && onChange({ radius: v }, `rad-${el.id}`)} />}
        </div>
      )}
      {!el.locked && (el.strokeWidth ?? 0) > 0 && <ColourField label="Outline colour" value={el.stroke ?? "#1b1f24"} onChange={(v) => onChange({ stroke: v }, `stroke-${el.id}`)} />}
    </>
  );
}

function ColourField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <fieldset>
      <legend className="label">{label}</legend>
      <div className="flex flex-wrap items-center gap-1.5">
        {SWATCHES.map((c) => (
          <button key={c} type="button" onClick={() => onChange(c)} aria-label={`Colour ${c}`} aria-pressed={value.toLowerCase() === c}
            className={`size-7 rounded-full border ${value.toLowerCase() === c ? "ring-2 ring-accent ring-offset-2" : "border-hairline"}`} style={{ background: c }} />
        ))}
        <label className="ml-1 inline-flex items-center gap-1.5 text-xs text-steel">
          <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="size-7 cursor-pointer rounded border border-hairline bg-sheet p-0.5" />
          Custom
        </label>
      </div>
    </fieldset>
  );
}

function Num({ label, value, onChange, min, step }: { label: string; value: number; onChange: (v: number) => void; min?: number; step?: number }) {
  return (
    <label className="block text-xs text-steel">
      {label}
      <input type="number" className="field mt-0.5 px-2 py-1.5" value={Math.round(value * 100) / 100} min={min} step={step ?? 1} onChange={(e) => onChange(e.target.valueAsNumber)} />
    </label>
  );
}
