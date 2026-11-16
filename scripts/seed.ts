/**
 * Seed data: the six divisions, parameter-driven products, size-independent
 * templates, and the demo accounts handed to reviewers.
 * Safe to re-run: catalogue rows upsert by slug, users are created once.
 * Run: node scripts/seed.ts
 *
 * Prices are integer pence, ex VAT. Unit price =
 *   max(minUnit, (base + area_cm2 * ratePerCm2) * material multiplier),
 * then the volume tier discount for the quantity applies (see src/lib/pricing).
 */
import { createClient } from "@supabase/supabase-js";
import { connect } from "./db.ts";

// ---------- demo accounts (test values for reviewers; also in README) ----
export const DEMO_USERS = [
  { email: "admin@dhprint.test", password: "Heroes-Admin-2026!", full_name: "Asha Admin", role: "admin" },
  { email: "customer@dhprint.test", password: "Heroes-Customer-2026!", full_name: "Charlie Customer", role: "customer", company: "Peak Trail Events" },
  { email: "second@dhprint.test", password: "Heroes-Second-2026!", full_name: "Sam Second", role: "customer", company: "Northside Bakery" },
  // Real inbox (Gmail plus-address of the studio account) so order emails can be seen arriving.
  { email: "g2hklic+customer@gmail.com", password: "Dh-cb6594a49b25-Test", full_name: "Rakshit Test", role: "customer", company: "Digital Heroes QA" },
];

const tiers = (t: Array<[number, number]>) => t.map(([min, discount]) => ({ min, discount }));
const fit = (minPt: number, maxPt: number, tracking = 0) => ({ shrinkToFit: true, minPt, maxPt, tracking });

const DIVISIONS = [
  { slug: "labels-stickers", name: "Labels & stickers", tagline: "Product labels and vinyl stickers, any size from 20 mm.", sort: 1 },
  { slug: "race-numbers", name: "Race & event numbers", tagline: "Tyvek bibs with names and numbers merged from your entry list.", sort: 2 },
  { slug: "mtb-boards", name: "MTB boards", tagline: "Rigid number boards that survive mud, rain and cable ties.", sort: 3 },
  { slug: "stamps", name: "Stamps", tagline: "Self-inking and wooden stamps, sharp at 600 dpi.", sort: 4 },
  { slug: "trophies", name: "Trophies", tagline: "Engraved plates for cups, shields and awards.", sort: 5 },
  { slug: "laser-cut", name: "Laser-cut work", tagline: "Cut and engraved acrylic and birch-ply signs.", sort: 6 },
];

type T = { name: string; design: unknown };
const PRODUCTS: Array<Record<string, unknown> & { division: string; templates: T[] }> = [
  {
    division: "labels-stickers", slug: "product-labels", name: "Product labels", sort: 1,
    summary: "Rectangular labels for jars, bottles and packaging.",
    description: "Printed full colour on your choice of paper or vinyl, kiss-cut on rolls or sheets.",
    config_schema: {
      width: { min: 20, max: 300, default: 90 }, height: { min: 20, max: 300, default: 60 },
      presets: [{ label: "Jar 90 × 60", w: 90, h: 60 }, { label: "Bottle 70 × 100", w: 70, h: 100 }, { label: "Square 50", w: 50, h: 50 }],
      materials: [
        { id: "gloss", name: "Gloss paper", mult: 1 }, { id: "matt", name: "Matt paper", mult: 1 },
        { id: "kraft", name: "Kraft paper", mult: 1.15 }, { id: "white-vinyl", name: "White vinyl (waterproof)", mult: 1.35 },
        { id: "clear-vinyl", name: "Clear vinyl", mult: 1.5 },
      ],
      quantity: { min: 10, max: 50000, default: 250 },
    },
    pricing: { base: 2, ratePerCm2: 0.35, minUnit: 4, setupFee: 1500, tiers: tiers([[100, 0.1], [250, 0.15], [500, 0.2], [1000, 0.3], [5000, 0.4]]) },
    bleed_mm: 2, safe_mm: 3, dpi: 300, supports_csv: false,
    templates: [{
      name: "Jar label", design: {
        background: "#f3ede2",
        elements: [
          { id: "frame", type: "rect", x: 0.04, y: 0.06, w: 0.92, h: 0.88, rotation: 0, fill: "none", stroke: "#3b2f2a", strokeWidth: 0.6, radius: 2, locked: true },
          { id: "brand", type: "text", x: 0.08, y: 0.14, w: 0.84, h: 0.14, rotation: 0, text: "NORTHSIDE BAKERY", font: "archivo", size: 0.1, color: "#3b2f2a", align: "center", fit: fit(5, 14, 60) },
          { id: "product", type: "text", x: 0.08, y: 0.34, w: 0.84, h: 0.3, rotation: 0, text: "Seville Orange Marmalade", font: "vibes", size: 0.24, color: "#a2471b", align: "center", fit: fit(10, 40) },
          { id: "detail", type: "text", x: 0.08, y: 0.72, w: 0.84, h: 0.12, rotation: 0, text: "340 g · Small batch · Best before: see lid", font: "lato", size: 0.07, color: "#3b2f2a", align: "center", fit: fit(5, 10) },
        ],
      },
    }],
  },
  {
    division: "labels-stickers", slug: "vinyl-stickers", name: "Vinyl stickers", sort: 2,
    summary: "Weatherproof die-cut style stickers for laptops, vans and windows.",
    description: "Outdoor-grade vinyl with a 3-year life outside.",
    config_schema: {
      width: { min: 25, max: 400, default: 100 }, height: { min: 25, max: 400, default: 100 },
      presets: [{ label: "100 mm square", w: 100, h: 100 }, { label: "Bumper 300 × 75", w: 300, h: 75 }],
      materials: [{ id: "white-vinyl", name: "White vinyl", mult: 1 }, { id: "clear-vinyl", name: "Clear vinyl", mult: 1.1 }, { id: "reflective", name: "Reflective vinyl", mult: 1.8 }],
      quantity: { min: 10, max: 20000, default: 100 },
    },
    pricing: { base: 5, ratePerCm2: 0.6, minUnit: 15, setupFee: 1500, tiers: tiers([[100, 0.1], [250, 0.15], [500, 0.25], [1000, 0.35]]) },
    bleed_mm: 2, safe_mm: 3, dpi: 300, supports_csv: false,
    templates: [{
      name: "Badge sticker", design: {
        background: "#1f3b57",
        elements: [
          { id: "ring", type: "ellipse", x: 0.06, y: 0.06, w: 0.88, h: 0.88, rotation: 0, fill: "none", stroke: "#f2c14e", strokeWidth: 1.2, locked: true },
          { id: "title", type: "text", x: 0.12, y: 0.3, w: 0.76, h: 0.24, rotation: 0, text: "TRAIL CREW", font: "alfa", size: 0.16, color: "#f2c14e", align: "center", fit: fit(8, 40, 20) },
          { id: "sub", type: "text", x: 0.12, y: 0.58, w: 0.76, h: 0.12, rotation: 0, text: "Est. 2026", font: "lato", bold: true, size: 0.08, color: "#ffffff", align: "center", fit: fit(6, 18) },
        ],
      },
    }],
  },
  {
    division: "race-numbers", slug: "race-bibs", name: "Race bibs", sort: 1,
    summary: "Tear-proof Tyvek running numbers, merged from your entry CSV.",
    description: "Upload your entry list and every bib is generated with the right name and number, with no manual tweaking.",
    config_schema: {
      width: { min: 120, max: 260, default: 210 }, height: { min: 90, max: 200, default: 148 },
      presets: [{ label: "A5 landscape 210 × 148", w: 210, h: 148 }, { label: "Kids 160 × 110", w: 160, h: 110 }],
      materials: [{ id: "tyvek", name: "Tyvek (tear-proof)", mult: 1 }, { id: "synthetic", name: "Waterproof synthetic paper", mult: 1.2 }],
      quantity: { min: 10, max: 20000, default: 300 },
    },
    pricing: { base: 5, ratePerCm2: 0.15, minUnit: 25, setupFee: 2500, tiers: tiers([[100, 0.1], [250, 0.15], [500, 0.2], [1000, 0.3]]) },
    bleed_mm: 3, safe_mm: 5, dpi: 300, supports_csv: true,
    templates: [{
      name: "Classic bib", design: {
        background: "#ffffff",
        elements: [
          { id: "band", type: "rect", x: 0, y: 0, w: 1, h: 0.2, rotation: 0, fill: "#c4105f", locked: true },
          { id: "event", type: "text", x: 0.06, y: 0.04, w: 0.88, h: 0.12, rotation: 0, text: "PEAK TRAIL 10K · 2026", font: "archivo", size: 0.09, color: "#ffffff", align: "center", fit: fit(8, 30, 40) },
          { id: "number", type: "text", x: 0.06, y: 0.24, w: 0.88, h: 0.52, rotation: 0, text: "1042", font: "anton", size: 0.5, color: "#1b1f24", align: "center", fit: fit(40, 220), field: "number" },
          { id: "name", type: "text", x: 0.06, y: 0.79, w: 0.88, h: 0.13, rotation: 0, text: "ALEX MORGAN", font: "lato", bold: true, size: 0.1, color: "#1b1f24", align: "center", fit: fit(10, 34, 30), field: "name" },
        ],
      },
    }],
  },
  {
    division: "mtb-boards", slug: "mtb-number-boards", name: "MTB number boards", sort: 1,
    summary: "Handlebar boards in polypropylene or Correx, cable-tie holes included.",
    description: "Bold numbers readable at speed. Merge riders from a CSV.",
    config_schema: {
      width: { min: 140, max: 260, default: 180 }, height: { min: 140, max: 260, default: 200 },
      presets: [{ label: "Standard 180 × 200", w: 180, h: 200 }, { label: "Junior 150 × 160", w: 150, h: 160 }],
      materials: [{ id: "pp", name: "Polypropylene 0.8 mm", mult: 1 }, { id: "correx", name: "Correx 3 mm", mult: 1.4 }],
      quantity: { min: 10, max: 5000, default: 120 },
    },
    pricing: { base: 30, ratePerCm2: 0.6, minUnit: 150, setupFee: 3000, tiers: tiers([[50, 0.05], [100, 0.12], [250, 0.2], [500, 0.28]]) },
    bleed_mm: 3, safe_mm: 8, dpi: 300, supports_csv: true,
    templates: [{
      name: "Enduro board", design: {
        background: "#f5d90a",
        elements: [
          { id: "series", type: "text", x: 0.08, y: 0.08, w: 0.84, h: 0.12, rotation: 0, text: "VALLEY ENDURO SERIES", font: "archivo", size: 0.07, color: "#111111", align: "center", fit: fit(8, 30, 30) },
          { id: "number", type: "text", x: 0.06, y: 0.24, w: 0.88, h: 0.52, rotation: 0, text: "27", font: "anton", size: 0.48, color: "#111111", align: "center", fit: fit(60, 300), field: "number" },
          { id: "rider", type: "text", x: 0.08, y: 0.8, w: 0.84, h: 0.11, rotation: 0, text: "J. RIVERA", font: "lato", bold: true, size: 0.08, color: "#111111", align: "center", fit: fit(10, 36, 20), field: "name" },
        ],
      },
    }],
  },
  {
    division: "stamps", slug: "self-inking-stamps", name: "Self-inking stamps", sort: 1,
    summary: "Address, logo and approval stamps with a crisp 600 dpi die.",
    description: "Choose the plate size; we make the rubber die from your artwork.",
    config_schema: {
      width: { min: 20, max: 80, default: 58 }, height: { min: 10, max: 60, default: 22 },
      presets: [{ label: "Address 58 × 22", w: 58, h: 22 }, { label: "Round 40", w: 40, h: 40 }, { label: "Approval 38 × 14", w: 38, h: 14 }],
      materials: [{ id: "printy", name: "Self-inking frame", mult: 1 }, { id: "wood", name: "Wooden handle", mult: 1.3 }],
      quantity: { min: 1, max: 500, default: 2 },
    },
    pricing: { base: 1100, ratePerCm2: 8, minUnit: 1100, setupFee: 0, tiers: tiers([[10, 0.05], [25, 0.1], [50, 0.15]]) },
    bleed_mm: 0, safe_mm: 1.5, dpi: 600, supports_csv: false,
    templates: [{
      name: "Address stamp", design: {
        background: "#ffffff",
        elements: [
          { id: "border", type: "rect", x: 0.02, y: 0.04, w: 0.96, h: 0.92, rotation: 0, fill: "none", stroke: "#000000", strokeWidth: 0.5, radius: 1, locked: true },
          { id: "co", type: "text", x: 0.06, y: 0.12, w: 0.88, h: 0.3, rotation: 0, text: "NORTHSIDE BAKERY LTD", font: "courier", bold: true, size: 0.22, color: "#000000", align: "center", fit: fit(5, 14) },
          { id: "addr", type: "text", x: 0.06, y: 0.5, w: 0.88, h: 0.36, rotation: 0, text: "12 Mill Lane, Leeds LS1 4AB\n0113 496 0000", font: "courier", size: 0.15, color: "#000000", align: "center", fit: fit(4, 10) },
        ],
      },
    }],
  },
  {
    division: "trophies", slug: "engraved-plates", name: "Engraved trophy plates", sort: 1,
    summary: "Brushed metal plates for cups, shields and plaques.",
    description: "Laser-engraved with names, events and dates. Adhesive backed.",
    config_schema: {
      width: { min: 40, max: 200, default: 70 }, height: { min: 20, max: 120, default: 25 },
      presets: [{ label: "Cup plate 70 × 25", w: 70, h: 25 }, { label: "Shield 100 × 30", w: 100, h: 30 }, { label: "Plaque 150 × 100", w: 150, h: 100 }],
      materials: [{ id: "gold", name: "Brushed gold", mult: 1 }, { id: "silver", name: "Brushed silver", mult: 1 }, { id: "black-gold", name: "Black with gold engrave", mult: 1.1 }],
      quantity: { min: 1, max: 500, default: 12 },
    },
    pricing: { base: 450, ratePerCm2: 2.5, minUnit: 450, setupFee: 0, tiers: tiers([[25, 0.05], [50, 0.1], [100, 0.15]]) },
    bleed_mm: 0, safe_mm: 2, dpi: 600, supports_csv: true,
    templates: [{
      name: "Champion plate", design: {
        background: "#d4b46a",
        elements: [
          { id: "title", type: "text", x: 0.05, y: 0.08, w: 0.9, h: 0.42, rotation: 0, text: "Champion", font: "vibes", size: 0.36, color: "#2b2414", align: "center", fit: fit(8, 60), field: "title" },
          { id: "event", type: "text", x: 0.05, y: 0.56, w: 0.9, h: 0.34, rotation: 0, text: "Valley Enduro Series 2026", font: "lato", bold: true, size: 0.2, color: "#2b2414", align: "center", fit: fit(5, 24), field: "event" },
        ],
      },
    }],
  },
  {
    division: "laser-cut", slug: "acrylic-signs", name: "Laser-cut signs", sort: 1,
    summary: "Cut and engraved acrylic or birch-ply signs and plaques.",
    description: "Vector-accurate cutting at 600 dpi equivalent. Rounded corners and fixing holes on request.",
    config_schema: {
      width: { min: 50, max: 600, default: 300 }, height: { min: 50, max: 600, default: 120 },
      presets: [{ label: "Door sign 300 × 120", w: 300, h: 120 }, { label: "Desk plaque 200 × 60", w: 200, h: 60 }],
      materials: [
        { id: "clear-3", name: "3 mm clear acrylic", mult: 1 }, { id: "black-3", name: "3 mm black acrylic", mult: 1 },
        { id: "birch-3", name: "3 mm birch ply", mult: 0.85 }, { id: "clear-5", name: "5 mm clear acrylic", mult: 1.5 },
      ],
      quantity: { min: 1, max: 1000, default: 5 },
    },
    pricing: { base: 300, ratePerCm2: 3, minUnit: 600, setupFee: 1000, tiers: tiers([[10, 0.05], [25, 0.1], [50, 0.15], [100, 0.2]]) },
    bleed_mm: 0, safe_mm: 4, dpi: 600, supports_csv: false,
    templates: [{
      name: "Workshop door sign", design: {
        background: "#e9e4d8",
        elements: [
          { id: "edge", type: "rect", x: 0.02, y: 0.05, w: 0.96, h: 0.9, rotation: 0, fill: "none", stroke: "#1b1f24", strokeWidth: 1, radius: 4, locked: true },
          { id: "title", type: "text", x: 0.06, y: 0.18, w: 0.88, h: 0.42, rotation: 0, text: "Workshop", font: "alfa", size: 0.34, color: "#1b1f24", align: "center", fit: fit(12, 120) },
          { id: "sub", type: "text", x: 0.06, y: 0.66, w: 0.88, h: 0.18, rotation: 0, text: "Staff only beyond this point", font: "lato", size: 0.12, color: "#1b1f24", align: "center", fit: fit(8, 30) },
        ],
      },
    }],
  },
];

async function seed() {
  const db = await connect();
  try {
    await db.query("begin");
    const divisionIds = new Map<string, string>();
    for (const d of DIVISIONS) {
      const r = await db.query(
        `insert into public.divisions (slug, name, tagline, sort) values ($1,$2,$3,$4)
         on conflict (slug) do update set name = excluded.name, tagline = excluded.tagline, sort = excluded.sort
         returning id`, [d.slug, d.name, d.tagline, d.sort]);
      divisionIds.set(d.slug, r.rows[0].id);
    }
    for (const p of PRODUCTS) {
      const r = await db.query(
        `insert into public.products (division_id, slug, name, summary, description, config_schema, pricing, bleed_mm, safe_mm, dpi, supports_csv, sort)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         on conflict (slug) do update set division_id = excluded.division_id, name = excluded.name, summary = excluded.summary,
           description = excluded.description, config_schema = excluded.config_schema, pricing = excluded.pricing,
           bleed_mm = excluded.bleed_mm, safe_mm = excluded.safe_mm, dpi = excluded.dpi, supports_csv = excluded.supports_csv, sort = excluded.sort
         returning id`,
        [divisionIds.get(p.division), p.slug, p.name, p.summary, p.description, p.config_schema, p.pricing,
         p.bleed_mm, p.safe_mm, p.dpi, p.supports_csv, p.sort]);
      const productId = r.rows[0].id;
      // Templates: replace the product's set so edits here are reflected.
      await db.query("delete from public.templates where product_id = $1 and id not in (select template_id from public.designs where template_id is not null)", [productId]);
      for (const [i, t] of p.templates.entries()) {
        const exists = await db.query("select id from public.templates where product_id = $1 and name = $2", [productId, t.name]);
        if (exists.rowCount) await db.query("update public.templates set design = $1, sort = $2 where id = $3", [t.design, i, exists.rows[0].id]);
        else await db.query("insert into public.templates (product_id, name, design, sort) values ($1,$2,$3,$4)", [productId, t.name, t.design, i]);
      }
    }
    await db.query("commit");
    console.log(`catalogue: ${DIVISIONS.length} divisions, ${PRODUCTS.length} products`);
  } catch (e) {
    await db.query("rollback");
    throw e;
  } finally {
    await db.end();
  }

  // Demo users via the Auth admin API (email pre-confirmed).
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 200 });
  for (const u of DEMO_USERS) {
    let id = list?.users.find((x) => x.email === u.email)?.id;
    if (!id) {
      const { data, error } = await admin.auth.admin.createUser({
        email: u.email, password: u.password, email_confirm: true, user_metadata: { full_name: u.full_name },
      });
      if (error) throw error;
      id = data.user.id;
    }
    const { error } = await admin.from("profiles").update({ role: u.role, full_name: u.full_name, company: u.company ?? null }).eq("id", id);
    if (error) throw error;
    console.log(`user ready: ${u.email} (${u.role})`);
  }
}

if (process.argv[1]?.endsWith("seed.ts")) seed().catch((e) => {
  console.error("seed failed:", e.message ?? e);
  process.exit(1);
});
