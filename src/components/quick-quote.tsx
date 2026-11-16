"use client";
/**
 * Instant price calculator (PRD §05). Pure client-side maths with the same
 * pricing function the server uses at checkout, so what you see here is
 * what you pay.
 */
import Link from "next/link";
import { useMemo, useState } from "react";
import { calculatePrice, formatMoney, VAT_RATE } from "@/lib/pricing/calculate";
import type { ConfigSchema, PricingRules } from "@/lib/catalog/types";

export interface QuoteProduct { slug: string; name: string; divisionSlug: string; config_schema: ConfigSchema; pricing: PricingRules }

export function QuickQuote({ products, initial }: { products: QuoteProduct[]; initial: string }) {
  const [slug, setSlug] = useState(initial);
  const product = products.find((p) => p.slug === slug) ?? products[0];
  const s = product.config_schema;
  const [cfg, setCfg] = useState({ w: s.width.default, h: s.height.default, m: s.materials[0].id, q: s.quantity.default });

  const choose = (next: string) => {
    const p = products.find((x) => x.slug === next)!;
    const ns = p.config_schema;
    setSlug(next);
    setCfg({ w: ns.width.default, h: ns.height.default, m: ns.materials[0].id, q: ns.quantity.default });
  };
  const clamp = (v: number, r: { min: number; max: number }) => Math.min(r.max, Math.max(r.min, Number.isFinite(v) ? v : r.min));
  const price = useMemo(() => calculatePrice(s, product.pricing, { widthMm: clamp(cfg.w, s.width), heightMm: clamp(cfg.h, s.height), materialId: cfg.m, quantity: Math.round(clamp(cfg.q, s.quantity)) }, VAT_RATE), [cfg, s, product.pricing]);

  return (
    <div id="quote" className="panel scroll-mt-24 p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-bold">Instant quote</h2>
        <span className="text-sm text-steel">updates as you type</span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="label" htmlFor="qq-product">Product</label>
          <select id="qq-product" className="field" value={slug} onChange={(e) => choose(e.target.value)}>
            {products.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}
          </select>
        </div>
        <Num id="qq-w" label="Width (mm)" value={cfg.w} range={s.width} onChange={(w) => setCfg({ ...cfg, w })} />
        <Num id="qq-h" label="Height (mm)" value={cfg.h} range={s.height} onChange={(h) => setCfg({ ...cfg, h })} />
        <div>
          <label className="label" htmlFor="qq-m">Material</label>
          <select id="qq-m" className="field" value={cfg.m} onChange={(e) => setCfg({ ...cfg, m: e.target.value })}>
            {s.materials.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <Num id="qq-q" label="Quantity" value={cfg.q} range={s.quantity} onChange={(q) => setCfg({ ...cfg, q })} />
      </div>
      <dl aria-live="polite" className="mt-5 space-y-1.5 border-t border-hairline pt-4 text-sm">
        <Row k="Per item" v={`${formatMoney(price.unitPence, "GBP", true)}${price.discountRate ? `  (−${Math.round(price.discountRate * 100)}% volume)` : ""}`} />
        {price.setupPence > 0 && <Row k="Setup" v={formatMoney(price.setupPence)} />}
        <Row k="VAT" v={formatMoney(price.vatPence)} />
        <div className="flex items-baseline justify-between pt-1">
          <dt className="font-semibold">Total</dt>
          <dd className="font-display text-2xl font-extrabold">{formatMoney(price.totalPence)}</dd>
        </div>
      </dl>
      {price.nextTier && <p className="mt-2 text-xs text-steel">Order {price.nextTier.min.toLocaleString("en-GB")} or more to save {Math.round(price.nextTier.discount * 100)}%.</p>}
      <Link className="btn-primary mt-4 w-full" href={`/products/${product.divisionSlug}/${product.slug}?w=${cfg.w}&h=${cfg.h}&m=${cfg.m}&q=${cfg.q}`}>Configure and design</Link>
    </div>
  );
}

function Num({ id, label, value, range, onChange }: { id: string; label: string; value: number; range: { min: number; max: number }; onChange: (v: number) => void }) {
  const bad = !(value >= range.min && value <= range.max);
  return (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      <input id={id} className={`field ${bad ? "border-danger" : ""}`} type="number" inputMode="numeric" min={range.min} max={range.max} value={Number.isFinite(value) ? value : ""} onChange={(e) => onChange(e.target.valueAsNumber)} aria-invalid={bad} aria-describedby={`${id}-hint`} />
      <p id={`${id}-hint`} className={`mt-1 text-xs ${bad ? "text-danger" : "text-steel"}`}>{range.min.toLocaleString("en-GB")} to {range.max.toLocaleString("en-GB")}</p>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between"><dt className="text-steel">{k}</dt><dd className="tabular-nums">{v}</dd></div>;
}
