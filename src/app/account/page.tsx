/**
 * Customer dashboard (PRD §10). Every query runs through serverClient, so
 * Row Level Security limits it to this customer's own rows; no filter in
 * this file is what keeps other customers' data out.
 *
 * Modules: account & profile status · proofs waiting for a decision ·
 * order history with status · one-click reorder · saved designs with their
 * configuration · invoice downloads.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { serverClient } from "@/lib/supabase/server";
import { getCatalog } from "@/lib/catalog/queries";
import { formatMoney } from "@/lib/pricing/calculate";
import { imagePaths, signedUrls } from "@/lib/storage";
import { StageChip } from "@/components/stage-track";
import { LivePreview } from "@/components/live-preview";
import type { Stage } from "@/lib/orders/pipeline";
import type { DesignDoc } from "@/lib/design/types";
import { ProfileForm, ReorderButton } from "./forms";

export const metadata: Metadata = { title: "Your account", robots: { index: false } };

export default function AccountPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <Suspense fallback={<Skeleton />}>
        <Dashboard />
      </Suspense>
    </div>
  );
}

interface OrderRow {
  id: string; number: string; status: Stage; total_pence: number; currency: string; created_at: string;
  invoices: { id: string } | { id: string }[] | null;
  order_items: Array<{ quantity: number; product_snapshot: { name: string; division?: string }; proofs: Array<{ id: string; version: number; status: string }> }>;
}

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" , timeZone: "Europe/London" });

async function Dashboard() {
  const user = await requireUser("/account");
  const supabase = await serverClient();
  const [{ data: profile }, { data: orders }, { data: designs }, { products }] = await Promise.all([
    supabase.from("profiles").select("full_name, company, phone, email, created_at").eq("id", user.id).single(),
    // Paid orders only: an unpaid checkout is a "quote" and its design stays in Saved designs.
    supabase.from("orders").select("id, number, status, total_pence, currency, created_at, invoices(id), order_items(quantity, product_snapshot, proofs(id, version, status))")
      .eq("customer_id", user.id).not("paid_at", "is", null).order("created_at", { ascending: false }).limit(50),
    supabase.from("designs").select("id, name, config, doc, upload_kind, product_id, updated_at")
      .eq("owner_id", user.id).eq("is_saved", true).order("updated_at", { ascending: false }).limit(12),
    getCatalog(),
  ]);
  const rows = (orders ?? []) as unknown as OrderRow[];

  // A proof needs the customer when the LATEST version is still pending.
  const waiting = rows.flatMap((o) => {
    const proofs = o.order_items[0]?.proofs ?? [];
    const latest = proofs.reduce<(typeof proofs)[number] | null>((a, p) => (!a || p.version > a.version ? p : a), null);
    return latest?.status === "pending" ? [{ order: o, proof: latest }] : [];
  });
  const docs = (designs ?? []).map((d) => d.doc as DesignDoc | null);
  const urls = await signedUrls(docs.flatMap((d) => imagePaths(d)), 3600);
  const missing = [!profile?.full_name && "your name", !profile?.phone && "a phone number"].filter(Boolean) as string[];

  return (
    <div className="space-y-12">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-steel">Signed in as {profile?.email}</p>
          <h1 className="mt-1 text-4xl font-extrabold">Hello{profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}</h1>
        </div>
        <Link className="btn-primary" href="/products">Start a new job</Link>
      </header>

      {/* Proofs waiting: the one thing that blocks production, so it comes first. */}
      <section aria-labelledby="proofs-h">
        <h2 id="proofs-h" className="text-xl font-bold">Proofs to review</h2>
        {waiting.length ? (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {waiting.map(({ order, proof }) => (
              <li key={proof.id} className="flex flex-wrap items-center justify-between gap-4 rounded-lg border-[1.5px] border-ink bg-sheet p-4">
                <div>
                  <p className="font-display text-lg font-bold">{order.number}, proof v{proof.version}</p>
                  <p className="text-sm text-steel">{order.order_items[0]?.product_snapshot.name} × {order.order_items[0]?.quantity.toLocaleString("en-GB")}</p>
                </div>
                <Link className="btn-primary py-2 text-sm" href={`/account/orders/${order.id}`}>Review proof v{proof.version}</Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-steel">Nothing waiting. When a proof is ready we email you and it appears here.</p>
        )}
      </section>

      <section aria-labelledby="orders-h">
        <h2 id="orders-h" className="text-xl font-bold">Orders</h2>
        {rows.length ? (
          <div className="panel mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b border-hairline text-left text-steel">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Order</th>
                  <th className="px-4 py-2.5 font-medium">Product</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 text-right font-medium">Total</th>
                  <th className="px-4 py-2.5 font-medium"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {rows.map((o) => {
                  const item = o.order_items[0];
                  const invoice = Array.isArray(o.invoices) ? o.invoices[0] : o.invoices;
                  return (
                    <tr key={o.id}>
                      <td className="px-4 py-3">
                        <Link className="link" href={`/account/orders/${o.id}`}>{o.number}</Link>
                        <span className="block text-xs text-steel">{dateFmt.format(new Date(o.created_at))}</span>
                      </td>
                      <td className="px-4 py-3">{item?.product_snapshot.name}<span className="block text-xs text-steel">Qty {item?.quantity.toLocaleString("en-GB")}</span></td>
                      <td className="px-4 py-3"><StageChip stage={o.status} label={o.status === "proof" ? "Proof to review" : undefined} /></td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatMoney(o.total_pence, o.currency)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                          {invoice && <a className="btn-quiet py-1.5 text-sm" href={`/files/invoice/${o.id}`}>Invoice</a>}
                          <ReorderButton orderId={o.id} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="panel mt-4 p-6 text-sm">
            <p className="font-medium">No orders yet.</p>
            <p className="mt-1 text-steel">Pick a product, design it here or upload your file, then approve a proof before anything is printed.</p>
            <Link className="btn-secondary mt-4" href="/products">Browse products</Link>
          </div>
        )}
      </section>

      <section aria-labelledby="designs-h">
        <h2 id="designs-h" className="text-xl font-bold">Saved designs</h2>
        {designs?.length ? (
          <ul className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {designs.map((d, i) => {
              const product = products.find((p) => p.id === d.product_id);
              const cfg = d.config as { widthMm: number; heightMm: number; materialId: string; quantity: number; csvRows?: number | null };
              const material = product?.config_schema.materials.find((m) => m.id === cfg.materialId)?.name;
              return (
                <li key={d.id} className="panel flex flex-col overflow-hidden">
                  <Link href={`/design/${d.id}`} className="mat grid aspect-[4/3] place-items-center p-4 [--k:0.8px]" aria-label={`Open ${d.name}`}>
                    {docs[i] ? (
                      <div className="w-full max-w-[85%]"><LivePreview doc={docs[i]!} guides={false} label={d.name} imageUrls={urls} /></div>
                    ) : (
                      <span className="chip bg-sheet text-steel">{(d.upload_kind ?? "file").toUpperCase()} file</span>
                    )}
                  </Link>
                  <div className="flex flex-1 flex-col p-3 text-sm">
                    <p className="line-clamp-2 font-semibold">{d.name}</p>
                    <dl className="mt-1 text-xs text-steel">
                      <dt className="sr-only">Configuration</dt>
                      <dd>{cfg.widthMm}×{cfg.heightMm} mm{material ? `, ${material}` : ""}</dd>
                      <dd>Qty {cfg.quantity.toLocaleString("en-GB")}{cfg.csvRows ? `, ${cfg.csvRows} CSV rows` : ""}</dd>
                    </dl>
                    <Link className="link mt-auto pt-2" href={`/design/${d.id}`}>{product ? "Edit and order" : "View"}</Link>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-steel">Designs you check out, or reorder, are kept here for next time.</p>
        )}
      </section>

      <section aria-labelledby="profile-h" className="panel p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="profile-h" className="text-xl font-bold">Your details</h2>
          <p className={`text-sm ${missing.length ? "text-warning" : "text-success"}`}>
            {missing.length ? `Add ${missing.join(" and ")} so we can reach you about proofs.` : "Profile complete"}
          </p>
        </div>
        <p className="mt-1 text-sm text-steel">Customer since {profile ? dateFmt.format(new Date(profile.created_at)) : "today"}. Invoices are addressed to the name and company below.</p>
        <div className="mt-4">
          <ProfileForm fullName={profile?.full_name ?? ""} company={profile?.company ?? ""} phone={profile?.phone ?? ""} />
        </div>
      </section>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading your account">
      <div className="h-10 w-64 animate-pulse rounded bg-mist" />
      <div className="h-24 animate-pulse rounded-lg bg-mist" />
      <div className="h-64 animate-pulse rounded-lg bg-mist" />
    </div>
  );
}
