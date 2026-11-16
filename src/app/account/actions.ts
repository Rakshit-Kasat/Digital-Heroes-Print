"use server";
/**
 * Customer actions. Each one asks auth.ts who the user is and passes that
 * id to the order service, which checks the order belongs to them. Nothing
 * from the browser is trusted beyond "which proof/order" and free text.
 */
import { after } from "next/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { serverClient } from "@/lib/supabase/server";
import { approveProof, generatePrintFiles, reorder, requestChanges } from "@/lib/orders/service";
import { startCheckout } from "@/lib/orders/checkout";

export interface FormState { ok?: boolean; error?: string; message?: string }

const uuid = z.string().uuid();
const message = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

const ProfileSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name.").max(120),
  company: z.string().trim().max(120),
  phone: z.string().trim().max(40).regex(/^[0-9+()\-\s]*$/, "Use digits, spaces and + ( ) - only."),
});

/** Profile: written through RLS; a DB trigger stops a customer changing their own role. */
export async function updateProfile(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = ProfileSchema.safeParse({ fullName: form.get("fullName"), company: form.get("company") ?? "", phone: form.get("phone") ?? "" });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { fullName, company, phone } = parsed.data;
  const supabase = await serverClient();
  const { error } = await supabase.from("profiles").update({ full_name: fullName, company: company || null, phone: phone || null }).eq("id", user.id);
  if (error) return { error: "Could not save your details." };
  revalidatePath("/account");
  return { ok: true, message: "Details saved." };
}

/**
 * Approve the latest proof. Print files are made AFTER the response is sent
 * (next/server after()), so the customer is not kept waiting for the render.
 * If that background job fails, staff can regenerate from the job board.
 */
export async function approve(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const proofId = uuid.safeParse(form.get("proofId"));
  if (!proofId.success) return { error: "Unknown proof." };
  if (form.get("confirm") !== "on") return { error: "Tick the box to confirm you have checked the proof." };
  try {
    const p = await approveProof(user.id, proofId.data);
    after(async () => {
      try { await generatePrintFiles(p.order_item_id); } catch (e) { console.error("print files after approval failed", p.order_item_id, e); }
    });
    revalidatePath(`/account/orders/${p.order_items.order_id}`);
    return { ok: true, message: `Proof v${p.version} approved. Your job is queued for production.` };
  } catch (e) {
    return { error: message(e, "Could not approve the proof.") };
  }
}

export async function askForChanges(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const proofId = uuid.safeParse(form.get("proofId"));
  const note = String(form.get("note") ?? "").trim();
  if (!proofId.success) return { error: "Unknown proof." };
  if (note.length < 5) return { error: "Tell us what to change (at least a few words)." };
  if (note.length > 2000) return { error: "Please keep the note under 2,000 characters." };
  try {
    const p = await requestChanges(user.id, proofId.data, note);
    revalidatePath(`/account/orders/${p.order_items.order_id}`);
    return { ok: true, message: "Thanks. Our studio will send a new proof version." };
  } catch (e) {
    return { error: message(e, "Could not send your request.") };
  }
}

/** One-click reorder: same artwork, today's price, straight to payment. */
export async function reorderAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const orderId = uuid.safeParse(form.get("orderId"));
  if (!orderId.success) return { error: "Unknown order." };
  let url: string;
  try {
    const { designId, order, item, product, price } = await reorder(user.id, orderId.data);
    url = await startCheckout({ order, item, product, price, email: user.email, cancelPath: `/design/${designId}?cancelled=1` });
  } catch (e) {
    return { error: message(e, "Could not start the reorder.") };
  }
  redirect(url); // outside try: redirect() works by throwing
}
