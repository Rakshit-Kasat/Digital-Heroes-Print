"use server";
/**
 * Designer server actions. Each one re-checks the session and loads the
 * design THROUGH RLS (serverClient), so a user can only touch their own.
 */
import { requireUser } from "@/lib/auth";
import { getCatalog } from "@/lib/catalog/queries";
import { parseDoc } from "@/lib/design/schema";
import { uploadDesign } from "@/lib/design/template";
import { validateConfig } from "@/lib/pricing/calculate";
import { serverClient } from "@/lib/supabase/server";
import { downloadFile } from "@/lib/storage";
import type { DesignDoc } from "@/lib/design/types";
import { createOrderFromDesign, type DesignConfig } from "@/lib/orders/service";
import { stripe } from "@/lib/stripe";
import { formatMoney } from "@/lib/pricing/calculate";

export interface ActionResult { ok: boolean; error?: string; savedAt?: string; url?: string; doc?: DesignDoc | null }
export type UploadKind = "pdf" | "svg" | "png" | "ai";

async function loadOwn(designId: string) {
  const user = await requireUser(`/design/${designId}`);
  const supabase = await serverClient();
  const { data: design } = await supabase.from("designs").select("*").eq("id", designId).single();
  if (!design) throw new Error("Design not found.");
  const { products } = await getCatalog();
  const product = products.find((p) => p.id === design.product_id);
  if (!product) throw new Error("This product is no longer available.");
  return { user, supabase, design, product };
}

const own = (path: string, uid: string, designId: string) => path.startsWith(`uploads/${uid}/${designId}/`) && !path.includes("..");

export async function saveDesign(designId: string, docInput: unknown, cfgInput: Partial<DesignConfig>, name?: string): Promise<ActionResult> {
  try {
    const { user, supabase, design, product } = await loadOwn(designId);
    const prev = design.config as DesignConfig;
    // Size is fixed by the product page; quantity/material/CSV may change here.
    const cfg: DesignConfig = {
      widthMm: prev.widthMm, heightMm: prev.heightMm,
      materialId: typeof cfgInput.materialId === "string" ? cfgInput.materialId : prev.materialId,
      quantity: Number.isInteger(cfgInput.quantity) ? cfgInput.quantity! : prev.quantity,
      csvPath: cfgInput.csvPath === null ? null : typeof cfgInput.csvPath === "string" && own(cfgInput.csvPath, user.id, designId) ? cfgInput.csvPath : prev.csvPath ?? null,
      csvRows: cfgInput.csvPath === null ? null : Number.isInteger(cfgInput.csvRows) ? cfgInput.csvRows! : prev.csvRows ?? null,
    };
    const errors = validateConfig(product.config_schema, cfg);
    if (errors.length) return { ok: false, error: errors.join(" ") };
    const doc = docInput === null ? null : parseDoc(docInput, user.id, { widthMm: cfg.widthMm, heightMm: cfg.heightMm, bleedMm: product.bleed_mm, safeMm: product.safe_mm });
    if (!doc && !design.upload_path) return { ok: false, error: "Nothing to save yet." };
    const { error } = await supabase.from("designs").update({ doc, config: cfg, is_saved: true, ...(name ? { name: name.slice(0, 120) } : {}) }).eq("id", designId);
    if (error) return { ok: false, error: "Could not save. Check your connection and try again." };
    return { ok: true, savedAt: new Date().toISOString() };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save." };
  }
}

/**
 * Called after the browser uploaded a finished file straight to storage.
 * The file's first bytes are checked against its claimed type (a renamed
 * .exe is rejected) and a PNG's pixel size is read from its header, so the
 * low-resolution warning does not depend on anything the browser says.
 */
export async function attachUpload(designId: string, path: string, kind: UploadKind): Promise<ActionResult> {
  try {
    const { user, supabase, design, product } = await loadOwn(designId);
    if (!own(path, user.id, designId) || !["pdf", "svg", "png", "ai"].includes(kind)) return { ok: false, error: "Upload rejected." };
    const bytes = await downloadFile(path);
    const head = new TextDecoder("latin1").decode(bytes.slice(0, 1024));
    const valid =
      kind === "png" ? bytes[0] === 0x89 && head.slice(1, 4) === "PNG" :
      kind === "pdf" ? head.startsWith("%PDF") :
      kind === "ai" ? head.startsWith("%PDF") || head.startsWith("%!PS") :
      /<svg[\s>]/i.test(new TextDecoder().decode(bytes.slice(0, 4096)));
    if (!valid) return { ok: false, error: `That file is not a valid ${kind.toUpperCase()}.` };
    const cfg = design.config as DesignConfig;
    // PNG/SVG can be proofed automatically; PDF/AI go to prepress for a staff proof.
    const doc = kind === "png" || kind === "svg" ? uploadDesign(path, cfg, product) : null;
    if (doc && kind === "png") {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      Object.assign(doc.elements[0], { pxW: view.getUint32(16), pxH: view.getUint32(20) }); // IHDR width/height
    }
    const { error } = await supabase.from("designs").update({ upload_path: path, upload_kind: kind, doc, is_saved: true }).eq("id", designId);
    if (error) return { ok: false, error: "Could not attach the file." };
    return { ok: true, doc };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Upload failed." };
  }
}

/** Remove an uploaded file and go back to designing from a blank page. */
export async function clearUpload(designId: string, blank: unknown): Promise<ActionResult> {
  const { user, supabase, design, product } = await loadOwn(designId);
  const cfg = design.config as DesignConfig;
  const doc = parseDoc(blank, user.id, { widthMm: cfg.widthMm, heightMm: cfg.heightMm, bleedMm: product.bleed_mm, safeMm: product.safe_mm });
  const { error } = await supabase.from("designs").update({ upload_path: null, upload_kind: null, doc }).eq("id", designId);
  return error ? { ok: false, error: "Could not remove the file." } : { ok: true, doc };
}

/** Save, create the order with a server-side price, and hand over to Stripe Checkout. */
export async function checkout(designId: string, docInput: unknown, cfgInput: Partial<DesignConfig>): Promise<ActionResult> {
  const saved = await saveDesign(designId, docInput, cfgInput);
  if (!saved.ok) return saved;
  const user = await requireUser(`/design/${designId}`);
  try {
    const { order, item, product, price } = await createOrderFromDesign(user.id, designId);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const session = await stripe().checkout.sessions.create({
      mode: "payment",
      customer_email: user.email,
      client_reference_id: order.id,
      metadata: { order_id: order.id, order_number: order.number },
      payment_intent_data: { metadata: { order_id: order.id, order_number: order.number } },
      line_items: [
        { quantity: 1, price_data: { currency: "gbp", unit_amount: price.subtotalPence, product_data: { name: `${product.name} × ${Number(item.quantity).toLocaleString("en-GB")}`, description: `Order ${order.number} · ${formatMoney(price.unitPence, "GBP", true)} each${price.setupPence ? ` + setup` : ""} · ex VAT` } } },
        { quantity: 1, price_data: { currency: "gbp", unit_amount: price.vatPence, product_data: { name: `VAT at ${Math.round(price.vatRate * 100)}%` } } },
      ],
      success_url: `${appUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/design/${designId}?cancelled=1`,
      expires_at: Math.floor(Date.now() / 1000) + 60 * 60, // 1 hour
      // Charge in GBP only, so the card statement matches the VAT invoice.
      adaptive_pricing: { enabled: false },
    });
    return session.url ? { ok: true, url: session.url } : { ok: false, error: "Checkout could not start." };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Checkout could not start." };
  }
}
