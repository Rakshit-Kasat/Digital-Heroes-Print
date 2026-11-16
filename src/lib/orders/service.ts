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
import { isOwnedUpload } from "@/lib/storage-path";
import { renderInvoicePdf } from "@/lib/invoice";
import { parseCsv } from "@/lib/print/csv";
import { applyRow } from "@/lib/design/template";
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
  // The CSV row count decides how many files get printed, so count it here
  // from the stored file instead of trusting the number the browser sent.
  let csvRows: number | null = null;
  if (cfg.csvPath) {
    if (!product.supports_csv) throw new Error("This product does not take a names-and-numbers list.");
    if (!isOwnedUpload(cfg.csvPath, userId)) throw new Error("CSV file not found.");
    csvRows = parseCsv(new TextDecoder().decode(await downloadFile(cfg.csvPath))).rows.length;
    if (csvRows > cfg.quantity) throw new Error(`Your CSV has ${csvRows} rows; increase the quantity to at least that.`);
  }

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
    line_total_pence: price.subtotalPence, csv_path: cfg.csvPath ?? null, csv_rows: csvRows,
    doc: design.doc, upload_path: design.upload_path, upload_kind: design.upload_kind,
  }).select("*").single();
  if (itemErr) throw itemErr;
  await db().from("designs").update({ is_saved: true }).eq("id", design.id);
  return { order, item, product, price };
}

/**
 * One-click reorder (PRD §09): copy the artwork exactly as it was ORDERED
 * (the frozen snapshot, not the editable design) into a new saved design,
 * then create a new order from it. The price is recalculated from today's
 * catalogue, so a reorder never inherits an old price.
 */
export async function reorder(userId: string, orderId: string) {
  // Only paid orders can be reordered (an abandoned checkout was never made).
  const { data: src } = await db().from("orders").select("id, number, customer_id, order_items(*)").eq("id", orderId).not("paid_at", "is", null).single();
  if (!src || src.customer_id !== userId) throw new Error("Order not found.");
  const item = src.order_items[0];
  if (!item) throw new Error("This order has no items to reorder.");
  // Prefer the approved proof's document: that is what was actually printed.
  const { data: approved } = await db().from("proofs").select("doc").eq("order_item_id", item.id).eq("status", "approved").order("version", { ascending: false }).limit(1).maybeSingle();
  const { data: design, error } = await db().from("designs").insert({
    owner_id: userId, product_id: item.product_id, name: `Reorder of ${src.number}`,
    config: item.config, doc: approved?.doc ?? item.doc, upload_path: item.upload_path, upload_kind: item.upload_kind, is_saved: true,
  }).select("id").single();
  if (error) throw error;
  return { designId: design.id as string, ...(await createOrderFromDesign(userId, design.id, src.id)) };
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
export async function markPaid(orderId: string, stripe: { sessionId: string; paymentIntent: string | null; amountTotal: number | null; currency: string | null }) {
  // The claim only matches if Stripe charged exactly what this order costs.
  const { data: claimed } = await db().from("orders")
    .update({ paid_at: new Date().toISOString(), stripe_session_id: stripe.sessionId, stripe_payment_intent: stripe.paymentIntent })
    .eq("id", orderId).is("paid_at", null).eq("status", "quote")
    .eq("total_pence", stripe.amountTotal ?? -1).eq("currency", (stripe.currency ?? "").toUpperCase())
    .select("id").maybeSingle();
  if (claimed) {
    await fulfil(orderId, true);
    return true;
  }
  const { data: paid } = await db().from("orders").select("paid_at, total_pence, invoices(id)").eq("id", orderId).maybeSingle();
  if (!paid?.paid_at) {
    console.error("Payment did not match the order; not marked paid", orderId, stripe.sessionId, stripe.amountTotal, paid?.total_pence);
    return false;
  }
  // Already paid. Over 2 minutes ago: an earlier attempt may have crashed
  // half-way, so finish what it left (fulfil is idempotent, emails are not re-sent).
  if (Date.now() - new Date(paid.paid_at).getTime() > 120_000) await fulfil(orderId, false);
  // Recent and not finished yet: throw, so the webhook answers 500 and Stripe
  // retries in a few minutes. Otherwise a crash in the first attempt would be final.
  else if (!paid.invoices?.length) throw new Error("Payment is still being processed; retry later.");
  return false;
}

/**
 * System-driven step (payment, artwork received): move only if the order is
 * still at `from`. If another request already moved it, this is a no-op, so
 * the webhook and the success page can both run without tripping over each other.
 */
async function advanceIf(orderId: string, from: Stage, to: Stage, note: string) {
  const { data } = await db().from("orders").update({ status: to }).eq("id", orderId).eq("status", from).select("id");
  if (data?.length) await db().from("order_events").insert({ order_id: orderId, from_status: from, to_status: to, actor_id: null, note });
}

/** Each step checks whether it is already done, so fulfil() can safely be re-run. */
async function fulfil(orderId: string, firstTime: boolean) {
  const load = async () => (await db().from("orders").select("*, profiles(full_name, company, email), invoices(id), order_items(*, proofs(id))").eq("id", orderId).single()).data;
  const order = await load();
  if (!order) throw new Error("Order not found.");
  const item = order.order_items[0];

  await advanceIf(orderId, "quote", "order", "Payment received (Stripe)");
  // invoices.order_id is unique, so PostgREST may embed it as an object rather than an array.
  const hasInvoice = Array.isArray(order.invoices) ? order.invoices.length > 0 : !!order.invoices;
  if (!hasInvoice) await issueInvoice(order);

  if (firstTime) {
    await sendEmail({
      to: order.profiles.email, template: "order_confirmation", orderId,
      subject: `Order ${order.number} confirmed`,
      heading: `Thanks, order ${order.number} is confirmed`,
      paragraphs: [`We have received your payment for ${item.quantity} × ${item.product_snapshot.name}.`, item.doc ? "Your first proof is ready to review now. Nothing is printed until you approve it." : "Our prepress team will check your file and send a proof shortly. Nothing is printed until you approve it."],
      cta: { label: "View your order", path: `/account/orders/${orderId}` },
    });
  }

  if (item.doc && !item.proofs?.length) {
    await advanceIf(orderId, "order", "artwork", "Artwork received from the online designer");
    let proofDoc = item.doc as DesignDoc;
    let note = "Automatic proof from your design.";
    // Variable data: proof the first real CSV row rather than the template's sample text.
    if (item.csv_path) {
      const { rows } = parseCsv(new TextDecoder().decode(await downloadFile(item.csv_path)));
      if (rows[0]) {
        proofDoc = applyRow(proofDoc, rows[0]);
        note = `Proof shows row 1 of ${rows.length} from your CSV. Every row was checked for fit when you uploaded it; all ${rows.length} print files are made from this approved layout.`;
      }
    }
    try {
      await createProofFromDoc(item.id, proofDoc, null, note);
    } catch (e) {
      // unique(order_item_id, version): a concurrent run already created v1.
      if ((e as { code?: string })?.code !== "23505") throw e;
    }
  }
  if (firstTime && STUDIO_EMAIL) await sendEmail({ to: STUDIO_EMAIL, template: "staff_new_order", orderId, subject: `New order ${order.number}`, heading: `New paid order ${order.number}`, paragraphs: [`${item.quantity} × ${item.product_snapshot.name} for ${order.profiles.full_name || order.profiles.email}.`], cta: { label: "Open in the job board", path: `/admin/orders/${orderId}` } });
}

async function issueInvoice(order: { id: string; number: string; subtotal_pence: number; vat_pence: number; total_pence: number; vat_rate: number; currency: string; profiles: { full_name: string; company: string | null; email: string }; order_items: Array<{ quantity: number; config: DesignConfig; product_snapshot: Record<string, unknown> }> }) {
  const number = `INV-${order.number.replace("DH-", "")}`;
  const item = order.order_items[0];
  const snap = item.product_snapshot as { name: string; material?: string; setupPence?: number; itemsPence?: number };
  const lines = [{ description: `${item.quantity} × ${snap.name}`, detail: `${item.config.widthMm} × ${item.config.heightMm} mm${snap.material ? `, ${snap.material}` : ""}`, amountPence: snap.itemsPence ?? order.subtotal_pence }];
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
  const { data } = await db().from("order_items").select("id, order_id, product_snapshot, orders(id, number, status, paid_at, customer_id, profiles(email, full_name))").eq("id", itemId).single();
  if (!data) throw new Error("Order item not found.");
  return data as unknown as { id: string; order_id: string; product_snapshot: { slug: string; name: string; dpi: number }; orders: { id: string; number: string; status: Stage; paid_at: string | null; customer_id: string; profiles: { email: string; full_name: string } } };
}

async function storeProof(itemId: string, files: { png: Uint8Array; svg?: string }, doc: DesignDoc | null, actorId: string | null, note: string | null) {
  const info = await orderForItem(itemId);
  // Proofs belong to paid jobs that are not yet in production.
  if (!info.orders.paid_at || !["order", "artwork", "proof"].includes(info.orders.status)) {
    throw new Error("Proofs can only be sent for paid jobs before production starts.");
  }
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
  // Print files made from an older approved version must not look "ready" any more.
  await db().from("print_files").delete().eq("order_item_id", itemId);
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
  if (STUDIO_EMAIL) await sendEmail({ to: STUDIO_EMAIL, template: "staff_proof_approved", orderId: p.order_items.order_id, subject: `${p.order_items.orders.number}: proof v${p.version} approved`, heading: "Proof approved, print files unlocked", paragraphs: [`Order ${p.order_items.orders.number} can move to production.`], cta: { label: "Open the job", path: `/admin/orders/${p.order_items.order_id}` } });
  return p;
}

export async function requestChanges(customerId: string, proofId: string, note: string) {
  const p = await proofForCustomer(customerId, proofId);
  // Check the stage first, so a refused move never leaves the proof half-answered.
  if (p.order_items.orders.status !== "proof") throw new Error("This job has moved on; contact the studio about changes.");
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
