/**
 * Public catalogue reads, cached across requests ('use cache') and tagged
 * "catalog" so an admin edit refreshes them at once with updateTag().
 * The catalogue is the same for every visitor, so it is safe to share.
 */
import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { publicClient } from "@/lib/supabase/server";
import type { Division, Product, Template } from "./types";

export const CATALOG_TAG = "catalog";

export async function getCatalog(): Promise<{ divisions: Division[]; products: Product[]; templates: Template[] }> {
  "use cache";
  cacheTag(CATALOG_TAG);
  cacheLife("hours");
  const db = publicClient();
  const [d, p, t] = await Promise.all([
    db.from("divisions").select("*").eq("active", true).order("sort"),
    db.from("products").select("*").eq("active", true).order("sort"),
    db.from("templates").select("*").eq("active", true).order("sort"),
  ]);
  if (d.error || p.error || t.error) throw d.error ?? p.error ?? t.error;
  return {
    divisions: d.data as Division[],
    // numeric columns arrive as strings from PostgREST
    products: (p.data as Product[]).map((x) => ({ ...x, bleed_mm: Number(x.bleed_mm), safe_mm: Number(x.safe_mm) })),
    templates: t.data as Template[],
  };
}

export async function findProduct(divisionSlug: string, productSlug: string) {
  const { divisions, products, templates } = await getCatalog();
  const division = divisions.find((d) => d.slug === divisionSlug);
  const product = products.find((p) => p.slug === productSlug && p.division_id === division?.id);
  if (!division || !product) return null;
  return { division, product, templates: templates.filter((t) => t.product_id === product.id) };
}

export async function findDivision(slug: string) {
  const { divisions, products, templates } = await getCatalog();
  const division = divisions.find((d) => d.slug === slug);
  if (!division) return null;
  const list = products.filter((p) => p.division_id === division.id);
  return { division, products: list, templates: templates.filter((t) => list.some((p) => p.id === t.product_id)) };
}
