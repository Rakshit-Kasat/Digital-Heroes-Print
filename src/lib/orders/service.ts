/**
 * Order service: every state-changing business rule in one server-only
 * module. Callers (server actions, the Stripe webhook) check WHO is acting;
 * this module checks WHAT is allowed (pipeline rules, proof gate) and does
 * the work with the service-role client.
 *
 * Life of an order:
 *  checkout -> createOrder (quote) -> Stripe -> markPaid (order, invoice,
 *  proof v1 from the frozen artwork -> artwork -> proof) -> customer approves
 *  or requests changes (-> artwork, then v2) -> print files unlocked ->
 *  staff advance to production -> completed.
 */
import "server-only";
import { adminClient } from "@/lib/supabase/server";
import { calculatePrice, validateConfig, VAT_RATE } from "@/lib/pricing/calculate";
import { canTransition, STAGE_LABEL, type ProofStatus, type Stage } from "@/lib/orders/pipeline";
import { layoutForPrint, printFileName, renderPdf, renderPng, svgForPrint } from "@/lib/print/render";
import { mergeCsv } from "@/lib/print/csvMerge.server";
import { downloadFile, loadImages, uploadFile } from "@/lib/storage";
import { renderInvoicePdf } from "@/lib/invoice";
import { sendEmail, STUDIO_EMAIL } from "@/lib/email";
import type { ConfigSchema, PricingRules } from "@/lib/catalog/types";
import type { DesignDoc, ProductConfig } from "@/lib/design/types";

const db = () => adminClient();

export interface DesignConfig extends ProductConfig { csvPath?: string | null; csvRows?: number | null }

/* ------------------------------------------------------------------ */
/* Creating the order (status "quote" until Stripe confirms payment)   */
/* ------------------------------------------------------------------ */

export async function createOrderFromDesign(userId: string, designId: string, reorderOf: string | null = null) {
  const { data: design } = await db().from("designs").select("*, products(*, divisions(name, slug))").eq("id", designId).eq("owner_id", userId).single();
  if (!design) throw new Error("Design not found.");
  const product = design.products;
  if (!product?.active) throw new Error("This product is no longer available.");
  const cfg = design.config as DesignConfig;
  const schema = product.config_schema as ConfigSchema;
  const errors = validateConfig(schema, cfg);
  if (errors.length) throw new Error(errors.join(" "));
  if (!design.doc && !design.upload_path) throw new Error("Add artwork before checking out.");
  if (product.supports_csv && cfg.csvPath && (cfg.csvRows ?? 0) > cfg.quantity) throw new Error(`Your CSV has ${cfg.csvRows} rows; increase the quantity to at least that.`);

  // Authoritative price: recomputed here from the database, never taken from the browser.
  const price = calculatePrice(schema, product.pricing as PricingRules, cfg, VAT_RATE);
  const { data: order, error } = await db().from("orders").insert({
    customer_id: userId, status: "quote", vat_rate: VAT_RATE, currency: "GBP",
    subtotal_pence: price.subtotalPence, vat_pence: price.vatPence, total_pence: price.totalPence, reorder_of: reorderOf,
  }).select("*").single();
  if (error) throw error;

  const material = schema.materials.find((m) => m.id === cfg.materialId);
  const { data: item, error: itemErr } = await db().from("order_items").insert({
    order_id: order.id, product_id: product.id, design_id: design.id,
    product_snapshot: {
      name: product.name, slug: product.slug, division: product.divisions?.name, divisionSlug: product.divisions?.slug,
      bleed_mm: Number(product.bleed_mm), safe_mm: Number(product.safe_mm), dpi: product.dpi, material: material?.name,
      setupPence: price.setupPence, itemsPence: price.itemsPence,
    },
    config: cfg, quantity: cfg.quantity, unit_price_pence: Math.round(price.unitPence), discount_rate: price.discountRate,
    line_total_pence: price.subtotalPence, csv_path: cfg.csvPath ?? null, csv_rows: cfg.csvRows ?? null,
    doc: design.doc, upload_path: design.upload_path, upload_kind: design.upload_kind,
  }).select("*").single();
  if (itemErr) throw itemErr;
  await db().from("designs").update({ is_saved: true }).eq("id", design.id);
  return { order, item, product, price };
}

/* ------------------------------------------------------------------ */
/* Status changes                                                       */
/* ------------------------------------------------------------------ */

async function latestProof(itemId: string): Promise<{ id: string; version: number; status: ProofStatus; doc: DesignDoc | null } | null> {
  const { data } = await db().from("proofs").select("id, version, status, doc").eq("order_item_id", itemId).order("version", { ascending: false }).limit(1).maybeSingle();
  return data as never;
}

export async function setStatus(orderId: string, to: Stage, actorId: string | null, note?: string) {
  const { data: order } = await db().from("orders").select("id, status, paid_at, order_items(id)").eq("id", orderId).single();
  if (!order) throw new Error("Order not found.");
  const item = order.order_items?.[0];
  const proof = item ? await latestProof(item.id) : null;
  const verdict = canTransition(order.status as Stage, to, { paid: !!order.paid_at, latestProof: proof?.status ?? null });
  if (!verdict.ok) throw new Error(verdict.reason);
  // Conditional update: only succeeds if nobody changed the status meanwhile.
  const { data: updated } = await db().from("orders").update({ status: to }).eq("id", orderId).eq("status", order.status).select("id");
  if (!updated?.length) throw new Error("The order changed while you were working on it. Reload and try again.");
  await db().from("order_events").insert({ order_id: orderId, from_status: order.status, to_status: to, actor_id: actorId, note: note ?? null });
  return { from: order.status as Stage, to };
}

/* ------------------------------------------------------------------ */
/* Payment                                                              */
/* ------------------------------------------------------------------ */

/**
 * Idempotent: called by the Stripe webhook AND the success page; whichever
 * arrives first does the work, the other is a no-op (conditional update).
 */
export async function markPaid(orderId: string, stripe: { sessionId: string; paymentIntent: string | null }) {
  const { data: claimed } = await db().from("orders")
    .update({ paid_at: new Date().toISOString(), stripe_session_id: stripe.sessionId, stripe_payment_intent: stripe.paymentIntent })
    .eq("id", orderId).is("paid_at", null).select("id").maybeSingle();
  if (!claimed) return false; // already processed

  await setStatus(orderId, "order", null, "Payment received (Stripe)");
  const { data: order } = await db().from("orders").select("*, profiles(full_name, company, email), order_items(*)").eq("id", orderId).single();
  const item = order.order_items[0];

  await issueInvoice(order);
  await sendEmail({
    to: order.profiles.email, template: "order_confirmation", orderId,
    subject: `Order ${order.number} confirmed`,
    heading: `Thanks — order ${order.number} is confirmed`,
    paragraphs: [`We have received your payment for ${item.quantity} × ${item.product_snapshot.name}.`, item.doc ? "Your first proof is ready to review now. Nothing is printed until you approve it." : "Our prepress team will check your file and send a proof shortly. Nothing is printed until you approve it."],
    cta: { label: "View your order", path: `/account/orders/${orderId}` },
  });
  if (item.doc) {
    await setStatus(orderId, "artwork", null, "Artwork received from the online designer");
    await createProofFromDoc(item.id, item.doc as DesignDoc, null, "Automatic proof from your design.");
  }
  if (STUDIO_EMAIL) await sendEmail({ to: STUDIO_EMAIL, template: "staff_new_order", orderId, subject: `New order ${order.number}`, heading: `New paid order ${order.number}`, paragraphs: [`${item.quantity} × ${item.product_snapshot.name} for ${order.profiles.full_name || order.profiles.email}.`], cta: { label: "Open in the job board", path: `/admin/orders/${orderId}` } });
  return true;
}

async function issueInvoice(order: { id: string; number: string; subtotal_pence: number; vat_pence: number; total_pence: number; vat_rate: number; currency: string; profiles: { full_name: string; company: string | null; email: string }; order_items: Array<{ quantity: number; config: DesignConfig; product_snapshot: Record<string, unknown> }> }) {
  const number = `INV-${order.number.replace("DH-", "")}`;
  const item = order.order_items[0];
  const snap = item.product_snapshot as { name: string; material?: string; setupPence?: number; itemsPence?: number };
  const lines = [{ description: `${item.quantity} × ${snap.name}`, detail: `${item.config.widthMm} × ${item.config.heightMm} mm · ${snap.material ?? ""}`, amountPence: snap.itemsPence ?? order.subtotal_pence }];
  if (snap.setupPence) lines.push({ description: "Setup and prepress", detail: "Proofing and file preparation", amountPence: snap.setupPence });
  const pdf = await renderInvoicePdf({
    invoiceNumber: number, orderNumber: order.number, issuedAt: new Date(),
    customer: { name: order.profiles.full_name, company: order.profiles.company, email: order.profiles.email },
    lines, subtotalPence: order.subtotal_pence, vatRate: Number(order.vat_rate), vatPence: order.vat_pence, totalPence: order.total_pence, currency: order.currency,
  });
  const path = await uploadFile(`invoices/${order.number}/${number}.pdf`, pdf, "application/pdf");
  await db().from("invoices").upsert({ order_id: order.id, number, pdf_path: path }, { onConflict: "order_id" });
}

/* ------------------------------------------------------------------ */
/* Proofs                                                               */
/* ------------------------------------------------------------------ */

async function orderForItem(itemId: string) {
  const { data } = await db().from("order_items").select("id, order_id, product_snapshot, orders(id, number, status, customer_id, profiles(email, full_name))").eq("id", itemId).single();
  if (!data) throw new Error("Order item not found.");
  return data as unknown as { id: string; order_id: string; product_snapshot: { slug: string; name: string; dpi: number }; orders: { id: string; number: string; status: Stage; customer_id: string; profiles: { email: string; full_name: string } } };
}

async function storeProof(itemId: string, files: { png: Uint8Array; svg?: string }, doc: DesignDoc | null, actorId: string | null, note: string | null) {
  const info = await orderForItem(itemId);
  const prev = await latestProof(itemId);
  const version = (prev?.version ?? 0) + 1;
  const base = `proofs/${info.orders.number}/v${version}`;
  const pngPath = await uploadFile(`${base}.png`, files.png, "image/png");
  const svgPath = files.svg ? await uploadFile(`${base}.svg`, files.svg, "image/svg+xml") : null;
  // Older pending versions can no longer be approved.
  await db().from("proofs").update({ status: "superseded" }).eq("order_item_id", itemId).eq("status", "pending");
  const { data: proof, error } = await db().from("proofs").insert({ order_item_id: itemId, version, png_path: pngPath, svg_path: svgPath, doc, note, created_by: actorId }).select("*").single();
  if (error) throw error;
  await db().from("proof_events").insert({ proof_id: proof.id, actor_id: actorId, action: "created", note });
  if (info.orders.status === "order") await setStatus(info.order_id, "artwork", actorId);
  const fresh = await db().from("orders").select("status").eq("id", info.order_id).single();
  if (fresh.data?.status === "artwork") await setStatus(info.order_id, "proof", actorId, `Proof v${version} sent`);
  await sendEmail({
    to: info.orders.profiles.email, template: "proof_ready", orderId: info.order_id,
    subject: `Proof v${version} for ${info.orders.number} is ready`,
    heading: `Your proof (version ${version}) is ready`,
    paragraphs: ["Please check spelling, numbers, colours and position. Approve it to send the job to production, or request changes.", ...(note ? [`Note from our studio: ${note}`] : [])],
    cta: { label: "Review the proof", path: `/account/orders/${info.order_id}` },
  });
  return proof;
}

/** Proof from a design document: PNG with trim/safe guides for review, SVG for the record. */
export async function createProofFromDoc(itemId: string, doc: DesignDoc, actorId: string | null, note: string | null = null) {
  const images = await loadImages(doc);
  const layout = layoutForPrint(doc);
  const { png } = renderPng(layout, images, 150, { guides: true });
  return storeProof(itemId, { png, svg: svgForPrint(layout, images) }, doc, actorId, note);
}

/** Proof prepared by staff outside the system (e.g. from a customer PDF). */
export async function createProofFromUpload(itemId: string, png: Uint8Array, actorId: string, note: string | null) {
  return storeProof(itemId, { png }, null, actorId, note);
}

async function proofForCustomer(customerId: string, proofId: string) {
  const { data } = await db().from("proofs").select("*, order_items(id, order_id, orders(id, number, customer_id, status))").eq("id", proofId).single();
  if (!data || data.order_items.orders.customer_id !== customerId) throw new Error("Proof not found.");
  const latest = await latestProof(data.order_item_id);
  if (latest?.id !== data.id) throw new Error("A newer proof version exists. Please review that one.");
  if (data.status !== "pending") throw new Error("This proof has already been answered.");
  return data as { id: string; version: number; order_item_id: string; order_items: { order_id: string; orders: { number: string; status: Stage } } };
}

export async function approveProof(customerId: string, proofId: string) {
  const p = await proofForCustomer(customerId, proofId);
  const { data } = await db().from("proofs").update({ status: "approved" }).eq("id", proofId).eq("status", "pending").select("id");
  if (!data?.length) throw new Error("This proof has already been answered.");
  await db().from("proof_events").insert({ proof_id: proofId, actor_id: customerId, action: "approved" });
  await db().from("order_events").insert({ order_id: p.order_items.order_id, from_status: p.order_items.orders.status, to_status: p.order_items.orders.status, actor_id: customerId, note: `Proof v${p.version} approved by customer` });
  if (STUDIO_EMAIL) await sendEmail({ to: STUDIO_EMAIL, template: "staff_proof_approved", orderId: p.order_items.order_id, subject: `${p.order_items.orders.number}: proof v${p.version} approved`, heading: "Proof approved — print files unlocked", paragraphs: [`Order ${p.order_items.orders.number} can move to production.`], cta: { label: "Open the job", path: `/admin/orders/${p.order_items.order_id}` } });
  return p;
}

export async function requestChanges(customerId: string, proofId: string, note: string) {
  const p = await proofForCustomer(customerId, proofId);
  const { data } = await db().from("proofs").update({ status: "changes_requested" }).eq("id", proofId).eq("status", "pending").select("id");
  if (!data?.length) throw new Error("This proof has already been answered.");
  await db().from("proof_events").insert({ proof_id: proofId, actor_id: customerId, action: "changes_requested", note });
  await setStatus(p.order_items.order_id, "artwork", customerId, `Changes requested on v${p.version}: ${note}`);
  if (STUDIO_EMAIL) await sendEmail({ to: STUDIO_EMAIL, template: "staff_changes_requested", orderId: p.order_items.order_id, subject: `${p.order_items.orders.number}: changes requested`, heading: `Changes requested on proof v${p.version}`, paragraphs: [note], cta: { label: "Open the job", path: `/admin/orders/${p.order_items.order_id}` } });
  return p;
}

/* ------------------------------------------------------------------ */
/* Print files (unlocked only by an approved proof)                     */
/* ------------------------------------------------------------------ */

export async function generatePrintFiles(itemId: string) {
  const info = await orderForItem(itemId);
  const proof = await latestProof(itemId);
  if (proof?.status !== "approved") throw new Error("Print files unlock when the latest proof is approved.");
  const { data: item } = await db().from("order_items").select("*").eq("id", itemId).single();
  const snap = info.product_snapshot;
  const date = new Date();
  const dir = `print-files/orders/${info.orders.number}`;
  const name = (output: string, ext: string) => printFileName(info.orders.number, snap.slug, date, output, ext);
  const rows: Array<{ kind: string; path: string; bytes: number }> = [];
  const put = async (file: string, body: Uint8Array | string, kind: string) => {
    const path = await uploadFile(`${dir}/${file}`, body);
    rows.push({ kind, path, bytes: typeof body === "string" ? Buffer.byteLength(body) : body.byteLength });
  };

  // The APPROVED proof's frozen document is the single source of truth.
  const doc = proof.doc;
  if (doc) {
    const images = await loadImages(doc);
    const layout = layoutForPrint(doc);
    await put(name("Print", "pdf"), await renderPdf(layout, images, { title: name("Print", "pdf"), slugLine: `${name("Print", "pdf")} · trim ${doc.widthMm}×${doc.heightMm} mm · bleed ${doc.bleedMm} mm · qty ${item.quantity}` }), "pdf");
    const { png, dpi } = renderPng(layout, images, snap.dpi);
    await put(name(`Print-${dpi}dpi`, "png"), png, "png");
    await put(name("Vector", "svg"), svgForPrint(layout, images), "svg");
    if (item.csv_path) {
      const csv = new TextDecoder().decode(await downloadFile(item.csv_path));
      const merged = await mergeCsv(doc, csv, { orderNumber: info.orders.number, productSlug: snap.slug, date, images });
      await put(merged.zipName, merged.zip, "zip");
    }
  }
  if (item.upload_path) {
    const ext = item.upload_path.split(".").pop() ?? "bin";
    await put(name("Customer-artwork", ext), await downloadFile(item.upload_path), "source");
  }
  await db().from("print_files").delete().eq("order_item_id", itemId);
  if (rows.length) await db().from("print_files").insert(rows.map((r) => ({ ...r, order_item_id: itemId })));
  return rows;
}

/** Customer-facing message when staff move a job forward. */
export async function notifyStatus(orderId: string, to: Stage) {
  if (to !== "production" && to !== "completed") return;
  const { data: o } = await db().from("orders").select("number, profiles(email)").eq("id", orderId).single();
  const email = (o?.profiles as unknown as { email: string } | null)?.email;
  if (!o || !email) return;
  await sendEmail({
    to: email, template: `status_${to}`, orderId,
    subject: `${o.number}: ${STAGE_LABEL[to].toLowerCase()}`,
    heading: to === "production" ? `Order ${o.number} is now printing` : `Order ${o.number} is complete`,
    paragraphs: [to === "production" ? "Your approved artwork is with our production team." : "Your order has been completed and is ready for dispatch or collection."],
    cta: { label: "View order", path: `/account/orders/${orderId}` },
  });
}
