/**
 * Job record (PRD §11): everything production needs for one order on one
 * page. Artwork and configuration, the proof versions and their approval
 * log, stage controls (each checked by canTransition), print-file
 * generation and download (locked until a proof is approved), archive,
 * and the email log for this order.
 */
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";
import { serverClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/pricing/calculate";
import { STAGES, STAGE_LABEL, canTransition, printFilesUnlocked, type ProofStatus, type Stage } from "@/lib/orders/pipeline";
import { StageChip, StageTrack } from "@/components/stage-track";
import { ActionForm } from "../../forms";
import { advance, makePrintFiles, regenerateProof, setArchived } from "../../actions";
import { ProofUpload } from "./proof-upload";

export const metadata: Metadata = { title: "Job" };

const when = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" , timeZone: "Europe/London" });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KIND_LABEL: Record<string, string> = { pdf: "Print PDF (bleed + crop marks)", png: "Print PNG", svg: "Vector SVG", zip: "CSV merge: one file per row (ZIP)", source: "Customer's original file" };

export default function JobPage(props: PageProps<"/admin/orders/[id]">) {
  return (
    <div>
      <Link className="btn-quiet -ml-2 text-sm" href="/admin">← Job board</Link>
      <Suspense fallback={<div className="mt-6 h-96 animate-pulse rounded-lg bg-mist" aria-label="Loading job" />}>
        <Job params={props.params} />
      </Suspense>
    </div>
  );
}

interface Proof { id: string; version: number; status: ProofStatus; note: string | null; created_at: string; proof_events: Array<{ action: string; note: string | null; created_at: string; profiles: { full_name: string | null; email: string; role: string } | null }> }

async function Job({ params }: Pick<PageProps<"/admin/orders/[id]">, "params">) {
  const admin = await requireAdmin();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const supabase = await serverClient();
  const [{ data: o }, { data: emails }] = await Promise.all([
    supabase.from("orders").select(`id, number, status, subtotal_pence, vat_pence, total_pence, currency, created_at, paid_at, archived_at, reorder_of, stripe_payment_intent,
      profiles(full_name, email, company, phone), invoices(number), order_events(id, from_status, to_status, note, created_at, profiles(full_name, email)),
      order_items(id, quantity, unit_price_pence, discount_rate, csv_path, csv_rows, upload_kind, upload_path, doc, config, product_snapshot,
        proofs(id, version, status, note, created_at, proof_events(action, note, created_at, profiles(full_name, email, role))),
        print_files(id, kind, path, bytes, created_at))`).eq("id", id).maybeSingle(),
    supabase.from("email_log").select("template, to_email, status, error, created_at").eq("order_id", id).order("created_at", { ascending: false }).limit(20),
  ]);
  if (!o) notFound();

  const status = o.status as Stage;
  const customer = o.profiles as unknown as { full_name: string | null; email: string; company: string | null; phone: string | null };
  const item = (o.order_items as unknown as Array<{
    id: string; quantity: number; unit_price_pence: number; discount_rate: number; csv_path: string | null; csv_rows: number | null; upload_kind: string | null; upload_path: string | null; doc: unknown;
    config: { widthMm: number; heightMm: number }; product_snapshot: { name: string; division?: string; material?: string; bleed_mm?: number; dpi?: number };
    proofs: Proof[]; print_files: Array<{ id: string; kind: string; path: string; bytes: number | null; created_at: string }>;
  }>)[0];
  const proofs = [...(item?.proofs ?? [])].sort((a, b) => b.version - a.version);
  const latest = proofs[0] ?? null;
  const ctx = { paid: !!o.paid_at, latestProof: latest?.status ?? null };
  const moves = STAGES.filter((s) => s !== status).map((s) => ({ s, v: canTransition(status, s, ctx) }));
  const allowed = moves.filter((m) => m.v.ok);
  const blockedNext = moves.find((m) => !m.v.ok && STAGES.indexOf(m.s) === STAGES.indexOf(status) + 1);
  const unlocked = printFilesUnlocked(latest?.status ?? null);
  const invoice = Array.isArray(o.invoices) ? o.invoices[0] : o.invoices;
  const events = [...(o.order_events ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const snap = item?.product_snapshot;

  return (
    <div className="mt-4 space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-extrabold">{o.number}</h1>
            <StageChip stage={status} />
            {o.archived_at && <span className="chip bg-mist text-steel">Archived</span>}
            {!o.paid_at && <span className="chip bg-danger/10 text-danger">Unpaid</span>}
          </div>
          <p className="mt-1 text-sm text-steel">
            Placed {when.format(new Date(o.created_at))}{o.paid_at ? ` · paid ${when.format(new Date(o.paid_at))}` : ""}{o.reorder_of ? " · reorder" : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {invoice && <a className="btn-secondary py-2 text-sm" href={`/files/invoice/${o.id}`}>Invoice {invoice.number}</a>}
        </div>
      </header>

      <StageTrack stage={status} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          {/* Stage control */}
          <section aria-labelledby="stage-h" className="panel p-5">
            <h2 id="stage-h" className="text-lg font-bold">Move the job</h2>
            {allowed.length ? (
              <div className="mt-3 flex flex-wrap gap-3">
                {allowed.map(({ s }) => (
                  <ActionForm key={s} action={advance} submit={`Move to ${STAGE_LABEL[s]}`} tone={STAGES.indexOf(s) > STAGES.indexOf(status) ? "primary" : "secondary"} confirm={`Confirm: ${STAGE_LABEL[s]}`}>
                    <input type="hidden" name="orderId" value={o.id} />
                    <input type="hidden" name="to" value={s} />
                  </ActionForm>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-steel">{status === "completed" ? "This job is complete." : "No stage change is possible yet."}</p>
            )}
            {blockedNext && !blockedNext.v.ok && <p className="mt-3 text-sm text-warning">Next stage ({STAGE_LABEL[blockedNext.s]}) is locked: {blockedNext.v.reason}</p>}
            {(status === "production" || status === "completed") && <p className="mt-3 text-xs text-steel">The customer is emailed when a job enters production and when it is completed.</p>}
          </section>

          {/* Proofs */}
          <section aria-labelledby="proofs-h" className="panel p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="proofs-h" className="text-lg font-bold">Proofs</h2>
              {latest && <span className="text-sm text-steel">Latest: v{latest.version} · {latest.status.replace("_", " ")}</span>}
            </div>
            {latest ? (
              <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <a href={`/files/proof/${latest.id}?view`} target="_blank" rel="noreferrer" className="block rounded bg-mist p-3" aria-label={`Open proof v${latest.version} full size`}>
                  <Image unoptimized loading="eager" src={`/files/proof/${latest.id}?view`} alt={`Proof v${latest.version}`} width={800} height={600} className="h-auto w-full bg-sheet" />
                </a>
                <ol className="space-y-3 text-sm">
                  {proofs.map((p) => (
                    <li key={p.id}>
                      <a className="link font-semibold" href={`/files/proof/${p.id}?view`} target="_blank" rel="noreferrer">v{p.version}</a>
                      <span className="ml-2 text-steel">{p.status.replace("_", " ")}</span>
                      <ul className="mt-1 space-y-0.5 text-xs text-steel">
                        {[...p.proof_events].sort((a, b) => a.created_at.localeCompare(b.created_at)).map((ev, i) => (
                          <li key={i}>
                            {ev.action.replace("_", " ")} by {ev.profiles ? (ev.profiles.full_name || ev.profiles.email) : "system"} · {when.format(new Date(ev.created_at))}
                            {ev.note && ev.action !== "created" ? <span className="block text-ink">“{ev.note}”</span> : null}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ol>
              </div>
            ) : (
              <p className="mt-2 text-sm text-steel">No proof yet.{item?.upload_kind ? ` The customer uploaded a ${item.upload_kind.toUpperCase()} file: check it and upload a PNG proof below.` : ""}</p>
            )}

            <div className="mt-5 grid gap-5 border-t border-hairline pt-5 md:grid-cols-2">
              {item?.doc ? (
                <ActionForm action={regenerateProof} submit="Send a new proof from the design" confirm="Confirm: send new version">
                  <input type="hidden" name="orderId" value={o.id} />
                  <label className="label" htmlFor="regen-note">Note to the customer <span className="font-normal text-steel">(optional)</span></label>
                  <textarea id="regen-note" name="note" rows={2} maxLength={500} className="field" />
                </ActionForm>
              ) : null}
              {status !== "completed" && status !== "production" && o.paid_at ? <ProofUpload orderId={o.id} adminId={admin.id} /> : null}
            </div>
          </section>

          {/* Print files */}
          <section aria-labelledby="files-h" className="panel p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="files-h" className="text-lg font-bold">Print files</h2>
              <span className={`chip ${item?.print_files.length ? "bg-success/12 text-success" : unlocked ? "bg-warning/12 text-warning" : "bg-mist text-steel"}`}>
                {item?.print_files.length ? "Ready for production" : unlocked ? "Unlocked, not generated" : "Locked until a proof is approved"}
              </span>
            </div>
            {item?.print_files.length ? (
              <ul className="mt-3 divide-y divide-hairline text-sm">
                {item.print_files.map((f) => (
                  <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>
                      <span className="font-medium">{KIND_LABEL[f.kind] ?? f.kind}</span>
                      <span className="block break-all text-xs text-steel">{f.path.split("/").pop()} · {f.bytes ? `${Math.max(1, Math.round(f.bytes / 1024)).toLocaleString("en-GB")} KB` : ""}</span>
                    </span>
                    <a className="btn-secondary py-1.5 text-sm" href={`/files/print/${f.id}`}>Download</a>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="mt-3">
              {unlocked ? (
                <ActionForm action={makePrintFiles} submit={item?.print_files.length ? "Regenerate print files" : "Generate print files"} pendingLabel="Rendering…">
                  <input type="hidden" name="orderId" value={o.id} />
                </ActionForm>
              ) : (
                <p className="text-sm text-steel">Files are produced from the approved proof only, so what prints is exactly what the customer signed off.</p>
              )}
            </div>
          </section>
        </div>

        <aside className="space-y-6">
          <section aria-labelledby="cust-h" className="panel p-5 text-sm">
            <h2 id="cust-h" className="text-lg font-bold">Customer</h2>
            <p className="mt-2 font-medium">{customer.full_name || "No name given"}</p>
            {customer.company && <p>{customer.company}</p>}
            <p className="break-all text-steel">{customer.email}</p>
            {customer.phone && <p className="text-steel">{customer.phone}</p>}
            <Link className="link mt-2 inline-block" href={`/admin?q=${encodeURIComponent(customer.email)}`}>All their orders</Link>
          </section>

          <section aria-labelledby="spec-h" className="panel p-5 text-sm">
            <h2 id="spec-h" className="text-lg font-bold">Specification</h2>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
              <dt className="text-steel">Product</dt><dd>{snap?.name}</dd>
              <dt className="text-steel">Range</dt><dd>{snap?.division}</dd>
              <dt className="text-steel">Trim size</dt><dd>{item?.config.widthMm} × {item?.config.heightMm} mm</dd>
              <dt className="text-steel">Bleed</dt><dd>{snap?.bleed_mm ?? 3} mm · {snap?.dpi ?? 300} dpi</dd>
              <dt className="text-steel">Material</dt><dd>{snap?.material}</dd>
              <dt className="text-steel">Quantity</dt><dd>{item?.quantity.toLocaleString("en-GB")}</dd>
              <dt className="text-steel">Artwork</dt>
              <dd>
                {item?.doc ? "Online designer" : `${item?.upload_kind?.toUpperCase()} upload`}
                {item?.upload_path && <a className="link ml-2" href={`/files/artwork/${item.id}`}>Download</a>}
              </dd>
              {item?.csv_path && (<><dt className="text-steel">CSV</dt><dd>{item.csv_rows} rows <a className="link ml-2" href={`/files/csv/${item.id}`}>Download</a></dd></>)}
            </dl>
            <dl className="mt-4 grid grid-cols-[1fr_auto] gap-y-1 border-t border-hairline pt-3">
              <dt className="text-steel">Unit (after {Math.round(Number(item?.discount_rate ?? 0) * 100)}% tier)</dt><dd className="text-right">{formatMoney(item?.unit_price_pence ?? 0, "GBP", true)}</dd>
              <dt className="text-steel">Subtotal</dt><dd className="text-right">{formatMoney(o.subtotal_pence)}</dd>
              <dt className="text-steel">VAT</dt><dd className="text-right">{formatMoney(o.vat_pence)}</dd>
              <dt className="font-semibold">Total</dt><dd className="text-right font-semibold">{formatMoney(o.total_pence, o.currency)}</dd>
            </dl>
            {o.stripe_payment_intent && <p className="mt-2 break-all text-xs text-steel">Stripe {o.stripe_payment_intent}</p>}
          </section>

          <section aria-labelledby="log-h" className="panel p-5 text-sm">
            <h2 id="log-h" className="text-lg font-bold">Stage history</h2>
            <ol className="mt-3 space-y-2.5 border-l-2 border-hairline pl-4">
              {events.map((e) => {
                const by = e.profiles as unknown as { full_name: string | null; email: string } | null;
                return (
                  <li key={e.id}>
                    <p className="font-medium">{e.from_status ? `${STAGE_LABEL[e.from_status as Stage]} → ` : ""}{STAGE_LABEL[e.to_status as Stage]}</p>
                    {e.note && <p className="text-steel">{e.note}</p>}
                    <p className="text-xs text-steel">{by ? by.full_name || by.email : "System"} · {when.format(new Date(e.created_at))}</p>
                  </li>
                );
              })}
            </ol>
          </section>

          <section aria-labelledby="mail-h" className="panel p-5 text-sm">
            <h2 id="mail-h" className="text-lg font-bold">Emails</h2>
            {emails?.length ? (
              <ul className="mt-2 space-y-1.5">
                {emails.map((m, i) => (
                  <li key={i} title={m.error ?? undefined}>
                    <span className={m.status === "sent" ? "text-success" : m.status === "failed" ? "text-danger" : "text-steel"}>{m.status}</span> · {m.template.replaceAll("_", " ")}
                    <span className="block text-xs text-steel">{m.to_email} · {when.format(new Date(m.created_at))}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-2 text-steel">None sent yet.</p>}
          </section>

          {status === "completed" && (
            <section className="panel p-5">
              <ActionForm action={setArchived} submit={o.archived_at ? "Restore to the board" : "Archive this job"}>
                <input type="hidden" name="orderId" value={o.id} />
                <input type="hidden" name="archive" value={o.archived_at ? "0" : "1"} />
              </ActionForm>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
