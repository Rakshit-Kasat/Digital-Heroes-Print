/**
 * Products & prices. Prices are data (products.pricing JSON), so changing
 * a rate here re-prices the storefront at once: the save action calls
 * updateTag("catalog"), which expires the cached catalogue. Adding a new
 * product family is a new row, not new code (PRD §14).
 */
import type { Metadata } from "next";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";
import { serverClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/pricing/calculate";
import type { ConfigSchema, PricingRules } from "@/lib/catalog/types";
import { ActionForm } from "../forms";
import { toggleTemplate, updateProduct } from "../actions";

export const metadata: Metadata = { title: "Products & prices" };

export default function ProductsAdmin() {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-lg bg-mist" aria-label="Loading products" />}>
      <Products />
    </Suspense>
  );
}

async function Products() {
  await requireAdmin();
  const supabase = await serverClient();
  // Admins see inactive rows too (RLS: "active or is_admin()").
  const [{ data: divisions }, { data: products }, { data: templates }] = await Promise.all([
    supabase.from("divisions").select("id, name, active").order("sort"),
    supabase.from("products").select("id, division_id, name, slug, active, pricing, config_schema, supports_csv, bleed_mm, dpi").order("sort"),
    supabase.from("templates").select("id, product_id, name, active").order("sort"),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold">Products & prices</h1>
        <p className="mt-1 max-w-2xl text-sm text-steel">
          Unit price = base + area (cm²) × rate × material multiplier, never below the minimum, then the volume tier discount. Setup is charged once per order. Amounts are in pence, ex VAT.
        </p>
      </div>
      {(divisions ?? []).map((d) => (
        <section key={d.id} aria-labelledby={`div-${d.id}`}>
          <h2 id={`div-${d.id}`} className="text-xl font-bold">{d.name}</h2>
          <div className="mt-3 grid gap-4 lg:grid-cols-2">
            {(products ?? []).filter((p) => p.division_id === d.id).map((p) => {
              const pr = p.pricing as PricingRules;
              const cs = p.config_schema as ConfigSchema;
              const tpl = (templates ?? []).filter((t) => t.product_id === p.id);
              return (
                <article key={p.id} className="panel p-5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-lg font-bold">{p.name}</h3>
                    <span className="text-xs text-steel">{cs.width.min}–{cs.width.max} × {cs.height.min}–{cs.height.max} mm · {p.dpi} dpi · {Number(p.bleed_mm)} mm bleed{p.supports_csv ? " · CSV" : ""}</span>
                  </div>
                  <ActionForm action={updateProduct} submit="Save prices" className="mt-4">
                    <input type="hidden" name="productId" value={p.id} />
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {([["base", "Base / unit", pr.base, "0.01"], ["ratePerCm2", "Rate per cm²", pr.ratePerCm2, "0.001"], ["minUnit", "Minimum / unit", pr.minUnit, "0.01"], ["setupFee", "Setup / order", pr.setupFee, "1"]] as const).map(([name, label, value, step]) => (
                        <div key={name}>
                          <label className="label text-xs" htmlFor={`${p.id}-${name}`}>{label} (p)</label>
                          <input className="field" id={`${p.id}-${name}`} name={name} type="number" min={0} step={step} defaultValue={value} required />
                        </div>
                      ))}
                    </div>
                    <div>
                      <label className="label text-xs" htmlFor={`${p.id}-tiers`}>Volume tiers (quantity:percent off)</label>
                      <input className="field" id={`${p.id}-tiers`} name="tiers" defaultValue={pr.tiers.map((t) => `${t.min}:${Math.round(t.discount * 1000) / 10}`).join(", ")} placeholder="100:10, 250:15" />
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="active" defaultChecked={p.active} className="size-4 accent-[var(--color-accent)]" /> On sale in the storefront
                    </label>
                    <p className="text-xs text-steel">Materials: {cs.materials.map((m) => `${m.name} ×${m.mult}`).join(", ")}. Setup now {formatMoney(pr.setupFee)}.</p>
                  </ActionForm>
                  {tpl.length > 0 && (
                    <div className="mt-4 border-t border-hairline pt-3">
                      <p className="text-sm font-medium">Templates</p>
                      <ul className="mt-2 space-y-1.5 text-sm">
                        {tpl.map((t) => (
                          <li key={t.id} className="flex items-center justify-between gap-2">
                            <span className={t.active ? "" : "text-steel line-through"}>{t.name}</span>
                            <ActionForm action={toggleTemplate} tone="quiet" submit={t.active ? "Hide" : "Show"}>
                              <input type="hidden" name="templateId" value={t.id} />
                              <input type="hidden" name="active" value={t.active ? "0" : "1"} />
                            </ActionForm>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
