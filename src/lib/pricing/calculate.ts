/**
 * Pricing engine (PRD §04 "live pricing", §05 volume discounts).
 *
 *   unit  = max(minUnit, base + area_cm² × ratePerCm2) × material multiplier
 *   items = round(unit × quantity × (1 − tier discount))
 *   subtotal = items + setup fee           (ex VAT)
 *   VAT      = round(subtotal × vatRate)
 *
 * Everything is integer pence so totals never drift from float errors.
 * The SAME function runs in the browser (instant display) and on the server
 * at checkout (authoritative). The client's number is never trusted.
 */
import type { ConfigSchema, PricingRules, Tier } from "@/lib/catalog/types";
import type { ProductConfig } from "@/lib/design/types";

export interface PriceBreakdown {
  areaCm2: number;
  unitBeforeDiscount: number; // pence, may be fractional (tiny labels cost < 1p/cm²)
  discountRate: number;       // 0..1 from the volume tier
  unitPence: number;          // effective unit price after discount, fractional
  itemsPence: number;         // quantity × unit, rounded once
  setupPence: number;
  subtotalPence: number;      // ex VAT
  vatRate: number;
  vatPence: number;
  totalPence: number;         // inc VAT
  nextTier: { min: number; discount: number } | null; // "order 250+ to save 15%"
}

/** Returns human-readable problems with a configuration (empty = valid). */
export function validateConfig(schema: ConfigSchema, cfg: ProductConfig): string[] {
  const errors: string[] = [];
  const inRange = (v: number, r: { min: number; max: number }) => Number.isFinite(v) && v >= r.min && v <= r.max;
  if (!inRange(cfg.widthMm, schema.width)) errors.push(`Width must be ${schema.width.min}–${schema.width.max} mm.`);
  if (!inRange(cfg.heightMm, schema.height)) errors.push(`Height must be ${schema.height.min}–${schema.height.max} mm.`);
  if (!Number.isInteger(cfg.quantity) || !inRange(cfg.quantity, schema.quantity))
    errors.push(`Quantity must be a whole number from ${schema.quantity.min} to ${schema.quantity.max}.`);
  if (!schema.materials.some((m) => m.id === cfg.materialId)) errors.push("Choose a material from the list.");
  return errors;
}

/** Highest tier whose minimum the quantity reaches (tiers may be unsorted). */
export function tierFor(tiers: Tier[], quantity: number): number {
  let best = 0;
  for (const t of tiers) if (quantity >= t.min && t.discount > best) best = t.discount;
  return best;
}

export function calculatePrice(
  schema: ConfigSchema,
  pricing: PricingRules,
  cfg: ProductConfig,
  vatRate: number,
): PriceBreakdown {
  const material = schema.materials.find((m) => m.id === cfg.materialId);
  if (!material) throw new Error(`Unknown material ${cfg.materialId}`);

  const areaCm2 = (cfg.widthMm / 10) * (cfg.heightMm / 10);
  const unitBeforeDiscount = Math.max(pricing.minUnit, pricing.base + areaCm2 * pricing.ratePerCm2) * material.mult;
  const discountRate = tierFor(pricing.tiers, cfg.quantity);
  const itemsPence = Math.round(unitBeforeDiscount * cfg.quantity * (1 - discountRate));
  const setupPence = Math.round(pricing.setupFee);
  const subtotalPence = itemsPence + setupPence;
  const vatPence = Math.round(subtotalPence * vatRate);

  const upcoming = [...pricing.tiers].sort((a, b) => a.min - b.min).find((t) => t.min > cfg.quantity && t.discount > discountRate);

  return {
    areaCm2,
    unitBeforeDiscount,
    discountRate,
    unitPence: itemsPence / cfg.quantity,
    itemsPence,
    setupPence,
    subtotalPence,
    vatRate,
    vatPence,
    totalPence: subtotalPence + vatPence,
    nextTier: upcoming ?? null,
  };
}

/** £1,234.56 — and small unit prices keep a third decimal (£0.043). */
export function formatMoney(pence: number, currency = "GBP", precise = false): string {
  const pounds = pence / 100;
  const digits = precise && pounds < 1 ? 3 : 2;
  return new Intl.NumberFormat("en-GB", { style: "currency", currency, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(pounds);
}

export const VAT_RATE = Number(process.env.NEXT_PUBLIC_VAT_RATE ?? "0.2");
