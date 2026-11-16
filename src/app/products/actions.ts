"use server";
/**
 * Starts a design from the configurator. The configuration is validated
 * against the product's rules on the server; the design row is inserted
 * as the signed-in user, so RLS guarantees ownership.
 */
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { getCatalog } from "@/lib/catalog/queries";
import { blankDesign, instantiateTemplate } from "@/lib/design/template";
import { validateConfig } from "@/lib/pricing/calculate";
import { serverClient } from "@/lib/supabase/server";

export interface StartState { error?: string }

export async function startDesign(_prev: StartState, form: FormData): Promise<StartState> {
  const productSlug = String(form.get("product") ?? "");
  const divisionSlug = String(form.get("division") ?? "");
  const cfg = {
    widthMm: Number(form.get("width")),
    heightMm: Number(form.get("height")),
    materialId: String(form.get("material") ?? ""),
    quantity: Number(form.get("quantity")),
  };
  const mode = form.get("mode") === "upload" ? "upload" : "design";
  const templateId = String(form.get("template") ?? "");

  const user = await getUser();
  if (!user) {
    const back = `/products/${divisionSlug}/${productSlug}?w=${cfg.widthMm}&h=${cfg.heightMm}&m=${cfg.materialId}&q=${cfg.quantity}`;
    redirect(`/login?next=${encodeURIComponent(back)}`);
  }

  const { products, templates } = await getCatalog();
  const product = products.find((p) => p.slug === productSlug);
  if (!product) return { error: "This product is no longer available." };
  const errors = validateConfig(product.config_schema, cfg);
  if (errors.length) return { error: errors.join(" ") };

  const template = templates.find((t) => t.id === templateId && t.product_id === product.id);
  const doc = mode === "upload" || !template ? blankDesign(cfg, product) : instantiateTemplate(template.design, cfg, product);
  const supabase = await serverClient();
  const { data, error } = await supabase.from("designs").insert({
    owner_id: user.id, product_id: product.id, template_id: template?.id ?? null,
    name: `${product.name} ${cfg.widthMm}×${cfg.heightMm} mm`, config: cfg, doc,
  }).select("id").single();
  if (error) return { error: "Could not start the design. Please try again." };
  redirect(`/design/${data.id}${mode === "upload" ? "?tab=upload" : ""}`);
}
