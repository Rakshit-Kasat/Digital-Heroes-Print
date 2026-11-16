"use client";
/**
 * Product configurator (PRD §04 parameter-driven products, §05 live pricing).
 * Size, material and quantity drive both the live preview (shared layout
 * engine) and the price (shared pricing engine) on every keystroke.
 */
import { useSearchParams } from "next/navigation";
import { useActionState, useMemo, useState, type CSSProperties } from "react";
import { calculatePrice, formatMoney, validateConfig, VAT_RATE } from "@/lib/pricing/calculate";
import { instantiateTemplate } from "@/lib/design/template";
import { LivePreview } from "@/components/live-preview";
import { startDesign, type StartState } from "../../actions";
import type { Product, Template } from "@/lib/catalog/types";

export function Configurator({ product, templates, divisionSlug }: { product: Product; templates: Template[]; divisionSlug: string }) {
  const s = product.config_schema;
  const params = useSearchParams();
  const num = (k: string, d: number) => { const v = Number(params.get(k)); return Number.isFinite(v) && v > 0 ? v : d; };
  const [w, setW] = useState(num("w", s.width.default));
  const [h, setH] = useState(num("h", s.height.default));
  const [m, setM] = useState(s.materials.some((x) => x.id === params.get("m")) ? params.get("m")! : s.materials[0].id);
  const [q, setQ] = useState(num("q", s.quantity.default));
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [state, action, pending] = useActionState<StartState, FormData>(startDesign, {});

  const cfg = { widthMm: w, heightMm: h, materialId: m, quantity: q };
  const errors = validateConfig(s, cfg);
  // Pricing is a few multiplications: computing it on every render is cheaper than memoising.
  const price = errors.length ? null : calculatePrice(s, product.pricing, cfg, VAT_RATE);
  const template = templates.find((t) => t.id === templateId);
  // Preview stays inside the allowed range while the customer is mid-typing.
  const pw = Math.min(Math.max(Number.isFinite(w) ? w : s.width.min, s.width.min), s.width.max);
  const ph = Math.min(Math.max(Number.isFinite(h) ? h : s.height.min, s.height.min), s.height.max);
  const doc = useMemo(() => (template ? instantiateTemplate(template.design, { widthMm: pw, heightMm: ph }, product) : null), [template, pw, ph, product]);
  const previewSize = { widthMm: pw, heightMm: ph };

  return (
    <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr]">
      <div className="order-2 lg:order-1">
        {/*
          The preview lies on the cutting mat at one scale (--k px per mm),
          chosen so the piece fits; the mat's grid uses the same --k, so one
          small square is always 10 mm and the size reads true at a glance.
        */}
        <div className="@container">
          <div className="mat relative grid min-h-80 place-items-center rounded-lg px-6 pb-14 pt-14 sm:min-h-[27rem]"
            style={{ "--k": `min(2.2px, calc((100cqi - 7rem) / ${pw + 2 * product.bleed_mm}), calc(19rem / ${ph + 2 * product.bleed_mm}))` } as CSSProperties}>
            <div className="relative" style={{ width: `calc(${pw + 2 * product.bleed_mm} * var(--k))` }}>
              <div aria-hidden className="dim-x absolute -top-8" style={{ left: `calc(${product.bleed_mm} * var(--k))`, right: `calc(${product.bleed_mm} * var(--k))` }}>{pw} mm</div>
              <div aria-hidden className="dim-y absolute -right-9" style={{ top: `calc(${product.bleed_mm} * var(--k))`, bottom: `calc(${product.bleed_mm} * var(--k))` }}>{ph} mm</div>
              {doc ? <LivePreview doc={doc} label={`${product.name} preview at ${w} by ${h} mm`} /> : <p className="text-mat-ink">Upload your own artwork for this product.</p>}
            </div>
            <p className="absolute bottom-3 left-4 rounded-[3px] bg-blade px-2 py-0.5 font-display text-sm font-semibold text-ink">Drawn to scale. One square is 10 mm.</p>
          </div>
        </div>
        <p className="mt-3 text-sm text-steel">
          Dashed black line: trim. Magenta line: safe area ({product.safe_mm} mm in). Artwork runs {product.bleed_mm} mm past the trim as bleed{product.dpi >= 600 ? "; this product is output at 600 dpi" : ""}.
        </p>
        {templates.length > 1 && (
          <fieldset className="mt-6">
            <legend className="label">Start from a template</legend>
            <div className="flex flex-wrap gap-2">
              {templates.map((t) => (
                <button key={t.id} type="button" onClick={() => setTemplateId(t.id)} className={`btn-secondary ${t.id === templateId ? "border-ink" : ""}`} aria-pressed={t.id === templateId}>{t.name}</button>
              ))}
            </div>
          </fieldset>
        )}
      </div>

      <form action={action} className="order-1 space-y-5 lg:order-2">
        <input type="hidden" name="product" value={product.slug} />
        <input type="hidden" name="division" value={divisionSlug} />
        <input type="hidden" name="template" value={templateId} />

        {s.presets.length > 0 && (
          <fieldset>
            <legend className="label">Common sizes</legend>
            <div className="flex flex-wrap gap-2">
              {s.presets.map((p) => {
                const active = p.w === w && p.h === h;
                return <button key={p.label} type="button" aria-pressed={active} onClick={() => { setW(p.w); setH(p.h); }} className={`chip min-h-9 border px-3 py-1.5 text-sm ${active ? "border-ink bg-ink text-paper" : "border-hairline bg-sheet text-ink hover:border-ink/50"}`}>{p.label}</button>;
              })}
            </div>
          </fieldset>
        )}

        <div className="grid grid-cols-2 gap-4">
          <NumField name="width" label="Width" unit="mm" value={w} range={s.width} onChange={setW} />
          <NumField name="height" label="Height" unit="mm" value={h} range={s.height} onChange={setH} />
        </div>

        <fieldset>
          <legend className="label">Material</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {s.materials.map((mat) => (
              <label key={mat.id} className={`flex cursor-pointer items-center justify-between rounded-md border px-3 py-2.5 text-sm ${mat.id === m ? "border-ink bg-sheet" : "border-hairline bg-sheet/60 hover:border-ink/40"}`}>
                <span className="flex items-center gap-2"><input type="radio" name="material" value={mat.id} checked={mat.id === m} onChange={() => setM(mat.id)} className="accent-accent" />{mat.name}</span>
                {mat.mult !== 1 && <span className="text-xs text-steel">{mat.mult > 1 ? "+" : "−"}{Math.round(Math.abs(mat.mult - 1) * 100)}%</span>}
              </label>
            ))}
          </div>
        </fieldset>

        <NumField name="quantity" label="Quantity" unit="" value={q} range={s.quantity} onChange={setQ} step={1} />

        <div className="panel p-4">
          <table className="w-full text-sm">
            <caption className="mb-2 text-left font-semibold">Volume pricing</caption>
            <tbody>
              {[{ min: s.quantity.min, discount: 0 }, ...product.pricing.tiers].map((t, i, all) => {
                const next = all[i + 1]?.min;
                const active = q >= t.min && (next === undefined || q < next);
                return (
                  <tr key={t.min} className={active ? "font-semibold text-ink" : "text-steel"}>
                    <td className="py-1 tabular-nums">{t.min.toLocaleString("en-GB")}{next ? ` to ${(next - 1).toLocaleString("en-GB")}` : " or more"}</td>
                    <td className="py-1 text-right">{active && <span className="mr-2 rounded-[3px] bg-blade px-1.5 py-0.5 text-xs font-semibold text-ink">your quantity</span>}{t.discount ? `${Math.round(t.discount * 100)}% off` : "list price"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div aria-live="polite" className="rounded-lg border-2 border-ink bg-sheet p-4">
          {price ? (
            <>
              <div className="flex items-baseline justify-between">
                <span className="text-sm tabular-nums text-steel">{q.toLocaleString("en-GB")} × {formatMoney(price.unitPence, "GBP", true)}{price.setupPence ? ` + ${formatMoney(price.setupPence)} setup` : ""}</span>
                <span className="font-display text-4xl font-extrabold tracking-tight">{formatMoney(price.totalPence)}</span>
              </div>
              <p className="mt-1 text-right text-sm tabular-nums text-steel">Includes {formatMoney(price.vatPence)} VAT. {formatMoney(price.subtotalPence)} before VAT.</p>
              {price.nextTier && <p className="mt-2 text-sm text-success">Order {price.nextTier.min.toLocaleString("en-GB")} or more to save {Math.round(price.nextTier.discount * 100)}%.</p>}
            </>
          ) : (
            <ul id="config-errors" className="space-y-1 text-sm text-danger">{errors.map((e) => <li key={e}>{e}</li>)}</ul>
          )}
        </div>

        {state.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
        {/* On a phone the actions stay pinned to the bottom with the total, so the price never scrolls away from the button. */}
        <div className="sticky bottom-0 z-10 -mx-4 flex flex-col gap-2 border-t border-hairline bg-paper px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:static sm:mx-0 sm:flex-row sm:border-0 sm:bg-transparent sm:p-0">
          {price && <p className="flex items-baseline justify-between text-sm text-steel sm:hidden"><span>Total with VAT</span><span className="font-display text-xl font-extrabold text-ink">{formatMoney(price.totalPence)}</span></p>}
          <button className="btn-primary flex-1" name="mode" value="design" disabled={!price || pending || !template} aria-describedby={errors.length ? "config-errors" : undefined}>Design it online</button>
          <button className="btn-secondary flex-1" name="mode" value="upload" disabled={!price || pending} aria-describedby={errors.length ? "config-errors" : undefined}>Upload print-ready file</button>
        </div>
        <p className="text-xs text-steel">You will see a proof before anything is printed.{product.supports_csv ? " Names and numbers can be merged from a CSV in the next step." : ""}</p>
      </form>
    </div>
  );
}

function NumField({ name, label, unit, value, range, onChange, step }: { name: string; label: string; unit: string; value: number; range: { min: number; max: number }; onChange: (v: number) => void; step?: number }) {
  const bad = !(value >= range.min && value <= range.max);
  return (
    <div>
      <label className="label" htmlFor={name}>{label}{unit && <span className="font-normal text-steel"> ({unit})</span>}</label>
      <input id={name} name={name} type="number" inputMode="numeric" step={step ?? 1} min={range.min} max={range.max} className={`field ${bad ? "border-danger" : ""}`} value={Number.isFinite(value) ? value : ""} onChange={(e) => onChange(e.target.valueAsNumber)} aria-invalid={bad} />
      <p className={`mt-1 text-xs ${bad ? "text-danger" : "text-steel"}`}>{range.min.toLocaleString("en-GB")} to {range.max.toLocaleString("en-GB")}</p>
    </div>
  );
}
