/**
 * One order, from the customer's side: where it is in the pipeline, the
 * current proof with approve / request-changes, every earlier version with
 * who did what and when (PRD §08 approval log), the price breakdown and the
 * invoice. Read through RLS: another customer's order id simply 404s.
 */
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { serverClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/pricing/calculate";
import { STAGE_LABEL, type Stage } from "@/lib/orders/pipeline";
import { StageChip, StageTrack } from "@/components/stage-track";
import { ProofDecision, ReorderButton } from "../../forms";

export const metadata: Metadata = { title: "Order", robots: { index: false } };

const when = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" , timeZone: "Europe/London" });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function OrderPage(props: PageProps<"/account/orders/[id]">) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <Link className="btn-quiet -ml-2 text-sm" href="/account">← Your account</Link>
      <Suspense fallback={<div className="mt-6 h-96 animate-pulse rounded-lg bg-mist" aria-label="Loading order" />}>
        <Order params={props.params} />
      </Suspense>
    </div>
  );
}

interface Proof { id: string; version: number; status: "pending" | "approved" | "changes_requested" | "superseded"; note: string | null; created_at: string; proof_events: Array<{ action: string; note: string | null; created_at: string; actor_id: string | null }> }
interface Item {
  id: string; quantity: number; unit_price_pence: number; discount_rate: number; line_total_pence: number; csv_rows: number | null; upload_kind: string | null;
  config: { widthMm: number; heightMm: number };
  product_snapshot: { name: string; division?: string; material?: string; setupPence?: number; bleed_mm?: number };
  proofs: Proof[];
}

const PROOF_STATE: Record<Proof["status"], string> = {
  pending: "Waiting for you",
  approved: "Approved",
  changes_requested: "Changes requested",
  superseded: "Replaced by a newer version",
};

async function Order({ params }: Pick<PageProps<"/account/orders/[id]">, "params">) {
  const { id } = await params;
  const user = await requireUser(`/account/orders/${id}`);
  if (!UUID.test(id)) notFound();
  const supabase = await serverClient();
  const { data } = await supabase.from("orders")
    .select("id, number, status, customer_id, subtotal_pence, vat_pence, vat_rate, total_pence, currency, created_at, paid_at, invoices(number, issued_at), order_events(id, from_status, to_status, note, created_at), order_items(id, quantity, unit_price_pence, discount_rate, line_total_pence, csv_rows, upload_kind, config, product_snapshot, proofs(id, version, status, note, created_at, proof_events(action, note, created_at, actor_id)))")
    .eq("id", id).maybeSingle();
  // RLS already hides other customers' orders; the explicit check also keeps admins on their own console.
  if (!data || data.customer_id !== user.id) notFound();

  const status = data.status as Stage;
  const item = (data.order_items as unknown as Item[])[0];
  const proofs = [...(item?.proofs ?? [])].sort((a, b) => b.version - a.version);
  const latest = proofs[0] ?? null;
  const invoice = Array.isArray(data.invoices) ? data.invoices[0] : data.invoices;
  const events = [...(data.order_events ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const snap = item?.product_snapshot;

  return (
    <div className="mt-4 space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-extrabold sm:text-4xl">{data.number}</h1>
            <StageChip stage={status} />
          </div>
          <p className="mt-1 text-steel">{snap?.name} × {item?.quantity.toLocaleString("en-GB")} · placed {when.format(new Date(data.created_at))}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {invoice && <a className="btn-secondary" href={`/files/invoice/${data.id}`}>Download invoice {invoice.number}</a>}
          <ReorderButton orderId={data.id} label="Reorder this job" />
        </div>
      </header>

      <StageTrack stage={status} />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Proof viewer */}
        <section aria-labelledby="proof-h" className="panel p-4 sm:p-6">
          {latest ? (
            <>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 id="proof-h" className="text-xl font-bold">Proof v{latest.version}</h2>
                <span className={`text-sm font-medium ${latest.status === "approved" ? "text-success" : latest.status === "pending" ? "text-accent" : "text-steel"}`}>{PROOF_STATE[latest.status]}</span>
              </div>
              <figure className="mt-4">
                <div className="grid place-items-center rounded-md bg-mist p-3 sm:p-6">
                  {/* unoptimized: the file is private, served through a short-lived signed URL, never via the public image cache */}
                  <Image unoptimized src={`/files/proof/${latest.id}?view`} alt={`Proof version ${latest.version} of ${data.number}`} width={1600} height={1200} loading="eager" className="sheet-shadow h-auto max-h-[60vh] w-auto bg-sheet" />
                </div>
                <figcaption className="mt-2 text-xs text-steel">
                  Dashed black line: trim (where it is cut). Dashed pink line: safe area. Anything outside the trim line is bleed and is cut off.
                </figcaption>
              </figure>
              {latest.note && <p className="mt-4 rounded-md border-l-4 border-accent bg-accent/5 px-4 py-3 text-sm"><span className="font-semibold">From our studio:</span> {latest.note}</p>}
              <div className="mt-5">
                {latest.status === "pending" && status === "proof" ? (
                  <ProofDecision proofId={latest.id} version={latest.version} />
                ) : latest.status === "approved" ? (
                  <p className="text-sm text-steel">You approved this version. Print files are made from exactly this artwork.</p>
                ) : latest.status === "changes_requested" ? (
                  <p className="text-sm text-steel">We have your change request and will send version {latest.version + 1} for review.</p>
                ) : null}
              </div>
            </>
          ) : (
            <>
              <h2 id="proof-h" className="text-xl font-bold">Proof</h2>
              <p className="mt-2 text-sm text-steel">
                {item?.upload_kind ? `Our prepress team is checking your ${item.upload_kind.toUpperCase()} file and will send a proof to review here.` : "Your proof is being prepared."} We email you when it is ready. Nothing is printed until you approve it.
              </p>
            </>
          )}
        </section>

        <aside className="space-y-6">
          <section aria-labelledby="summary-h" className="panel p-5 text-sm">
            <h2 id="summary-h" className="text-lg font-bold">Job</h2>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
              <dt className="text-steel">Product</dt><dd>{snap?.name}</dd>
              {snap?.division && (<><dt className="text-steel">Range</dt><dd>{snap.division}</dd></>)}
              <dt className="text-steel">Size</dt><dd>{item?.config.widthMm} × {item?.config.heightMm} mm{snap?.bleed_mm ? ` + ${snap.bleed_mm} mm bleed` : ""}</dd>
              {snap?.material && (<><dt className="text-steel">Material</dt><dd>{snap.material}</dd></>)}
              <dt className="text-steel">Quantity</dt><dd>{item?.quantity.toLocaleString("en-GB")}</dd>
              {item?.csv_rows ? (<><dt className="text-steel">Names</dt><dd>{item.csv_rows} rows from your CSV</dd></>) : null}
            </dl>
            <dl className="mt-4 grid grid-cols-[1fr_auto] gap-y-1.5 border-t border-hairline pt-3">
              <dt className="text-steel">{item?.quantity.toLocaleString("en-GB")} × {formatMoney(item ? (item.line_total_pence - (snap?.setupPence ?? 0)) / item.quantity : 0, "GBP", true)}{item?.discount_rate ? ` (${Math.round(item.discount_rate * 100)}% volume discount)` : ""}</dt>
              <dd className="text-right">{formatMoney((item?.line_total_pence ?? 0) - (snap?.setupPence ?? 0))}</dd>
              {snap?.setupPence ? (<><dt className="text-steel">Setup</dt><dd className="text-right">{formatMoney(snap.setupPence)}</dd></>) : null}
              <dt className="text-steel">Subtotal</dt><dd className="text-right">{formatMoney(data.subtotal_pence)}</dd>
              <dt className="text-steel">VAT at {Math.round(Number(data.vat_rate) * 100)}%</dt><dd className="text-right">{formatMoney(data.vat_pence)}</dd>
              <dt className="font-semibold">Total paid</dt><dd className="text-right font-semibold">{formatMoney(data.total_pence, data.currency)}</dd>
            </dl>
          </section>

          <section aria-labelledby="history-h" className="panel p-5 text-sm">
            <h2 id="history-h" className="text-lg font-bold">History</h2>
            <ol className="mt-3 space-y-3 border-l-2 border-hairline pl-4">
              {events.map((e) => (
                <li key={e.id}>
                  <p className="font-medium">{e.note ?? STAGE_LABEL[e.to_status as Stage]}</p>
                  <p className="text-xs text-steel">{when.format(new Date(e.created_at))}</p>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>

      {proofs.length > 1 || (latest && latest.proof_events.length > 1) ? (
        <section aria-labelledby="versions-h">
          <h2 id="versions-h" className="text-xl font-bold">Proof versions</h2>
          <p className="mt-1 text-sm text-steel">Every version we sent, and every decision on it.</p>
          <ul className="mt-4 grid gap-3 md:grid-cols-2">
            {proofs.map((p) => (
              <li key={p.id} className="panel flex gap-4 p-4">
                <a href={`/files/proof/${p.id}?view`} target="_blank" rel="noreferrer" className="block w-24 shrink-0 rounded bg-mist p-1.5" aria-label={`Open proof v${p.version} full size`}>
                  <Image unoptimized src={`/files/proof/${p.id}?view`} alt="" width={200} height={150} className="h-auto w-full bg-sheet" />
                </a>
                <div className="min-w-0 text-sm">
                  <p className="font-semibold">v{p.version} · {PROOF_STATE[p.status]}</p>
                  <ul className="mt-1 space-y-1 text-steel">
                    {[...p.proof_events].sort((a, b) => a.created_at.localeCompare(b.created_at)).map((ev, i) => (
                      <li key={i}>
                        {ev.action === "created" ? "Sent" : ev.action === "approved" ? "Approved by you" : "You asked for changes"} · {when.format(new Date(ev.created_at))}
                        {ev.action === "changes_requested" && ev.note ? <span className="block text-ink">“{ev.note}”</span> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
