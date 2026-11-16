/**
 * Catalogue shapes stored as JSON in products.config_schema / products.pricing.
 * A product is a set of RULES, not a list of SKUs (PRD §04): any size inside
 * the range, any listed material, any quantity in the range.
 */
import type { TemplateDoc } from "@/lib/design/types";

export interface Range { min: number; max: number; default: number }
export interface Material { id: string; name: string; mult: number }
export interface Preset { label: string; w: number; h: number }

export interface ConfigSchema {
  width: Range;   // mm
  height: Range;  // mm
  presets: Preset[];
  materials: Material[];
  quantity: Range;
}

/** All money values are integer pence, ex VAT. */
export interface Tier { min: number; discount: number } // discount 0.15 = 15% off
export interface PricingRules {
  base: number;       // per-unit base cost (pence)
  ratePerCm2: number; // per-unit cost per cm² of printed area (pence)
  minUnit: number;    // floor for the per-unit price (pence)
  setupFee: number;   // once per order line (pence)
  tiers: Tier[];      // volume discounts, by minimum quantity
}

export interface Division {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  sort: number;
}

export interface Product {
  id: string;
  division_id: string;
  slug: string;
  name: string;
  summary: string;
  description: string;
  config_schema: ConfigSchema;
  pricing: PricingRules;
  bleed_mm: number;
  safe_mm: number;
  dpi: number;
  supports_csv: boolean;
  active: boolean;
  sort: number;
}

export interface Template {
  id: string;
  product_id: string;
  name: string;
  design: TemplateDoc;
  sort: number;
}
