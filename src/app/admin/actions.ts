"use server";
/**
 * Production console actions. Every one starts with requireAdmin(): the
 * check runs on the server for each call, so hiding a button is never the
 * only protection. Business rules (pipeline, proof gate) live in the order
 * service; this file only translates form input into those calls.
 */
import { after } from "next/server";
import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { adminClient, serverClient } from "@/lib/supabase/server";
import { downloadFile } from "@/lib/storage";
import { CATALOG_TAG } from "@/lib/catalog/queries";
import { STAGES, type Stage } from "@/lib/orders/pipeline";
import { createProofFromDoc, createProofFromUpload, generatePrintFiles, notifyStatus, setStatus } from "@/lib/orders/service";
import type { DesignDoc } from "@/lib/design/types";

export interface AdminState { ok?: boolean; error?: string; message?: string }

const uuid = z.string().uuid();
const fail = (e: unknown, fallback: string): AdminState => ({ error: e instanceof Error ? e.message : fallback });
const refresh = (orderId: string) => { revalidatePath(`/admin/orders/${orderId}`); revalidatePath("/admin"); };

/** Move a job to another stage. canTransition() inside setStatus enforces the pipeline and the proof gate. */
export async function advance(_prev: AdminState, form: FormData): Promise<AdminState> {
  const admin = await requireAdmin();
  const orderId = uuid.safeParse(form.get("orderId"));
  const to = z.enum(STAGES).safeParse(form.get("to"));
  if (!orderId.success || !to.success) return { error: "Unknown order or stage." };
  try {
    await setStatus(orderId.data, to.data as Stage, admin.id, String(form.get("note") ?? "").trim() || undefined);
    after(() => notifyStatus(orderId.data, to.data as Stage).catch((e) => console.error("status email", e)));
    refresh(orderId.data);
    return { ok: true, message: "Stage updated." };
  } catch (e) {
    return fail(e, "Could not change the stage.");
  }
}

async function itemFor(orderId: string) {
  const { data } = await adminClient().from("order_items").select("id, doc, order_id").eq("order_id", orderId).single();
  if (!data) throw new Error("Order item not found.");
  return data as { id: string; doc: DesignDoc | null; order_id: string };
}

/** Re-render a proof from the customer's frozen design (e.g. after fixing a template). */
export async function regenerateProof(_prev: AdminState, form: FormData): Promise<AdminState> {
  const admin = await requireAdmin();
  const orderId = uuid.safeParse(form.get("orderId"));
  if (!orderId.success) return { error: "Unknown order." };
  try {
    const item = await itemFor(orderId.data);
    if (!item.doc) return { error: "This order has an uploaded file, not a design. Upload a proof image instead." };
    const p = await createProofFromDoc(item.id, item.doc, admin.id, String(form.get("note") ?? "").trim() || null);
    refresh(orderId.data);
    return { ok: true, message: `Proof v${p.version} sent to the customer.` };
  } catch (e) {
    return fail(e, "Could not create the proof.");
  }
}

/**
 * Staff-made proof (from a customer PDF/AI). The browser uploaded the PNG
 * straight into the admin's own storage folder; we re-check the path and
 * the real file bytes before it becomes a proof.
 */
export async function uploadProof(_prev: AdminState, form: FormData): Promise<AdminState> {
  const admin = await requireAdmin();
  const orderId = uuid.safeParse(form.get("orderId"));
  const path = String(form.get("path") ?? "");
  if (!orderId.success) return { error: "Unknown order." };
  if (!path.startsWith(`uploads/${admin.id}/${orderId.data}/`) || path.includes("..")) return { error: "Upload the proof again." };
  try {
    const bytes = await downloadFile(path);
    const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
    if (!isPng) return { error: "Proofs must be PNG images (export the page from your prepress software)." };
    const item = await itemFor(orderId.data);
    const p = await createProofFromUpload(item.id, bytes, admin.id, String(form.get("note") ?? "").trim() || null);
    refresh(orderId.data);
    return { ok: true, message: `Proof v${p.version} sent to the customer.` };
  } catch (e) {
    return fail(e, "Could not attach the proof.");
  }
}

export async function makePrintFiles(_prev: AdminState, form: FormData): Promise<AdminState> {
  await requireAdmin();
  const orderId = uuid.safeParse(form.get("orderId"));
  if (!orderId.success) return { error: "Unknown order." };
  try {
    const item = await itemFor(orderId.data);
    const rows = await generatePrintFiles(item.id);
    refresh(orderId.data);
    return { ok: true, message: `${rows.length} print file${rows.length === 1 ? "" : "s"} ready.` };
  } catch (e) {
    return fail(e, "Could not generate print files.");
  }
}

/** Archive keeps completed work out of the live board but one click away (PRD §11.06). */
export async function setArchived(_prev: AdminState, form: FormData): Promise<AdminState> {
  await requireAdmin();
  const orderId = uuid.safeParse(form.get("orderId"));
  const archive = form.get("archive") === "1";
  if (!orderId.success) return { error: "Unknown order." };
  const { data } = await adminClient().from("orders").update({ archived_at: archive ? new Date().toISOString() : null })
    .eq("id", orderId.data).eq("status", "completed").select("id");
  if (!data?.length) return { error: "Only completed orders can be archived." };
  refresh(orderId.data);
  return { ok: true, message: archive ? "Order archived." : "Order restored to the board." };
}

/* ------------------------------------------------------------------ */
/* Users                                                                */
/* ------------------------------------------------------------------ */

export async function setRole(_prev: AdminState, form: FormData): Promise<AdminState> {
  const admin = await requireAdmin();
  const userId = uuid.safeParse(form.get("userId"));
  const role = z.enum(["customer", "admin"]).safeParse(form.get("role"));
  if (!userId.success || !role.success) return { error: "Unknown user or role." };
  if (userId.data === admin.id && role.data !== "admin") return { error: "You cannot remove your own admin access. Ask another admin." };
  // Through RLS as the signed-in admin; the DB trigger refuses to remove the last admin.
  const supabase = await serverClient();
  const { error } = await supabase.from("profiles").update({ role: role.data }).eq("id", userId.data);
  if (error) return { error: error.message.includes("administrator") ? "At least one administrator must remain." : "Could not change the role." };
  revalidatePath("/admin/users");
  return { ok: true, message: role.data === "admin" ? "Now an admin." : "Now a customer." };
}

/* ------------------------------------------------------------------ */
/* Catalogue (prices and availability are data, not code)              */
/* ------------------------------------------------------------------ */

const PricingSchema = z.object({
  base: z.coerce.number().min(0).max(100000),
  ratePerCm2: z.coerce.number().min(0).max(1000),
  minUnit: z.coerce.number().min(0).max(100000),
  setupFee: z.coerce.number().int().min(0).max(1000000),
  tiers: z.array(z.object({ min: z.number().int().min(2), discount: z.number().min(0).max(0.9) })).max(10),
});

/** Parses "100:10, 250:15" (quantity: percent off) into tiers. */
function parseTiers(text: string) {
  return text.split(",").map((s) => s.trim()).filter(Boolean).map((pair) => {
    const [min, pct] = pair.split(":").map((x) => Number(x.trim()));
    return { min, discount: Math.round(pct * 100) / 10000 };
  }).sort((a, b) => a.min - b.min);
}

export async function updateProduct(_prev: AdminState, form: FormData): Promise<AdminState> {
  await requireAdmin();
  const productId = uuid.safeParse(form.get("productId"));
  if (!productId.success) return { error: "Unknown product." };
  const pricing = PricingSchema.safeParse({
    base: form.get("base"), ratePerCm2: form.get("ratePerCm2"), minUnit: form.get("minUnit"), setupFee: form.get("setupFee"),
    tiers: parseTiers(String(form.get("tiers") ?? "")),
  });
  if (!pricing.success) return { error: `Check the prices: ${pricing.error.issues[0].path.join(".")} ${pricing.error.issues[0].message}` };
  const supabase = await serverClient();
  const { error } = await supabase.from("products").update({ pricing: pricing.data, active: form.get("active") === "on" }).eq("id", productId.data);
  if (error) return { error: "Could not save the product." };
  updateTag(CATALOG_TAG); // storefront and calculators show the new price on the next request
  revalidatePath("/admin/products");
  return { ok: true, message: "Saved. The storefront uses the new prices now." };
}

export async function toggleTemplate(_prev: AdminState, form: FormData): Promise<AdminState> {
  await requireAdmin();
  const templateId = uuid.safeParse(form.get("templateId"));
  if (!templateId.success) return { error: "Unknown template." };
  const supabase = await serverClient();
  const { error } = await supabase.from("templates").update({ active: form.get("active") === "1" }).eq("id", templateId.data);
  if (error) return { error: "Could not update the template." };
  updateTag(CATALOG_TAG);
  revalidatePath("/admin/products");
  return { ok: true };
}
