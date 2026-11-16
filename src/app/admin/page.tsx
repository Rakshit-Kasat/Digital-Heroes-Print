/**
 * Job board (PRD §11): one queue from quote to done.
 *  01 search & filter by status, customer, date and product type (URL params,
 *     so a filtered view can be bookmarked or shared with a colleague)
 *  02 ready-for-production badge (latest proof approved => files unlocked)
 *  06 archive view for completed work
 * Read through RLS: only admins have a policy that returns every order.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";
import { serverClient } from "@/lib/supabase/server";
import { getCatalog } from "@/lib/catalog/queries";
import { formatMoney } from "@/lib/pricing/calculate";
import { STAGES, STAGE_LABEL, type Stage } from "@/lib/orders/pipeline";
import { StageChip } from "@/components/stage-track";

export const metadata: Metadata = { title: "Job board" };

const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" , timeZone: "Europe/London" });

export default function JobBoard(props: PageProps<"/admin">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-lg bg-mist" aria-label="Loading jobs" />}>
      <Board searchParams={props.searchParams} />
    </Suspense>
  );
}

interface Row {
  id: string; number: string; status: Stage; total_pence: number; currency: string; created_at: string; paid_at: string | null; archived_at: string | null;
  profiles: { full_name: string | null; email: string; company: string | null };
  order_items: Array<{ quantity: number; csv_rows: number | null; upload_kind: string | null; product_snapshot: { name: string; division?: string }; proofs: Array<{ version: number; status: string }>; print_files: Array<{ id: string }> }>;
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

async function Board({ searchParams }: Pick<PageProps<"/admin">, "searchParams">) {
  await requireAdmin();
  const sp = await searchParams;
  const status = one(sp.status) as Stage | "";
  const q = one(sp.q).trim().slice(0, 80);
  const division = one(sp.division);
  const from = /^\d{4}-\d{2}-\d{2}$/.test(one(sp.from)) ? one(sp.from) : "";
  const to = /^\d{4}-\d{2}-\d{2}$/.test(one(sp.to)) ? one(sp.to) : "";
  const archived = one(sp.view) === "archive";

  const supabase = await serverClient();
  // !inner turns the embedded filters below into real filters on the order list.
  let query = supabase.from("orders")
    .select("id, number, status, total_pence, currency, created_at, paid_at, archived_at, profiles!inner(full_name, email, company), order_items!inner(quantity, csv_rows, upload_kind, product_snapshot, proofs(version, status), print_files(id))")
    .order("created_at", { ascending: false }).limit(100);
  query = archived ? query.not("archived_at", "is", null) : query.is("archived_at", null);
  if (status && (STAGES as readonly string[]).includes(status)) query = query.eq("status", status);
  if (division) query = query.eq("order_items.product_snapshot->>divisionSlug", division);
  if (from) query = query.gte("created_at", from);
  if (to) query = query.lt("created_at", new Date(new Date(to).getTime() + 86_400_000).toISOString().slice(0, 10));
  if (q) {
    const safe = q.replace(/[%,()*]/g, " ");
    query = /^dh-?\d+$/i.test(q) ? query.ilike("number", `%${safe.replace(/^dh-?/i, "")}%`)
      : query.or(`full_name.ilike.%${safe}%,email.ilike.%${safe}%,company.ilike.%${safe}%`, { referencedTable: "profiles" });
  }

  const [{ data, error }, { data: counts }, { divisions }] = await Promise.all([
    query,
    supabase.from("report_orders_by_status").select("status, orders"),
    getCatalog(),
  ]);
  const rows = (data ?? []) as unknown as Row[];
  const countOf = (s: string) => counts?.find((c) => c.status === s)?.orders ?? 0;
  const link = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ ...(status && { status }), ...(q && { q }), ...(division && { division }), ...(from && { from }), ...(to && { to }), ...(archived && { view: "archive" }), ...patch });
    for (const [k, v] of [...p.entries()]) if (!v) p.delete(k);
    const s = p.toString();
    return s ? `/admin?${s}` : "/admin";
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-3xl font-extrabold">{archived ? "Archive" : "Job board"}</h1>
        <Link className="btn-quiet text-sm" href={archived ? "/admin" : "/admin?view=archive"}>{archived ? "Back to the live board" : "Open the archive"}</Link>
      </div>

      {!archived && (
        <nav aria-label="Filter by stage" className="grid grid-cols-3 gap-2 sm:grid-cols-7">
          <Link href={link({ status: "" })} aria-current={!status ? "true" : undefined}
            className={`panel px-3 py-2 text-sm ${!status ? "border-ink" : "hover:border-ink/40"}`}>
            <span className="block text-xs text-steel">All live</span>
            <span className="text-lg font-bold">{(counts ?? []).reduce((a, c) => a + c.orders, 0)}</span>
          </Link>
          {STAGES.map((s) => (
            <Link key={s} href={link({ status: s })} aria-current={status === s ? "true" : undefined}
              className={`panel px-3 py-2 text-sm ${status === s ? "border-ink" : "hover:border-ink/40"}`}>
              <span className="block truncate text-xs text-steel">{STAGE_LABEL[s]}</span>
              <span className="text-lg font-bold">{countOf(s)}</span>
            </Link>
          ))}
        </nav>
      )}

      <form className="panel grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_auto]" action="/admin" role="search">
        {status && <input type="hidden" name="status" value={status} />}
        {archived && <input type="hidden" name="view" value="archive" />}
        <div>
          <label className="label" htmlFor="q">Search</label>
          <input className="field" id="q" name="q" defaultValue={q} placeholder="Order number, customer, email or company" />
        </div>
        <div>
          <label className="label" htmlFor="division">Product type</label>
          <select className="field" id="division" name="division" defaultValue={division}>
            <option value="">All ranges</option>
            {divisions.map((d) => <option key={d.id} value={d.slug}>{d.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="from">From</label>
          <input className="field" id="from" name="from" type="date" defaultValue={from} />
        </div>
        <div>
          <label className="label" htmlFor="to">To</label>
          <input className="field" id="to" name="to" type="date" defaultValue={to} />
        </div>
        <div className="flex items-end gap-2">
          <button className="btn-primary py-2">Filter</button>
          {(q || division || from || to) && <Link className="btn-quiet py-2" href={link({ q: "", division: "", from: "", to: "" })}>Clear</Link>}
        </div>
      </form>

      {error && <p role="alert" className="text-sm text-danger">Could not load jobs: {error.message}</p>}

      {rows.length ? (
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm tabular-nums">
            <thead className="border-b-[1.5px] border-ink bg-mist text-left text-steel">
              <tr>
                <th className="px-4 py-2.5 font-medium">Job</th>
                <th className="px-4 py-2.5 font-medium">Customer</th>
                <th className="px-4 py-2.5 font-medium">Product</th>
                <th className="px-4 py-2.5 font-medium">Stage</th>
                <th className="px-4 py-2.5 font-medium">Proof</th>
                <th className="px-4 py-2.5 font-medium">Files</th>
                <th className="px-4 py-2.5 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {rows.map((o) => {
                const item = o.order_items[0];
                const latest = [...(item?.proofs ?? [])].sort((a, b) => b.version - a.version)[0];
                const unlocked = latest?.status === "approved";
                const files = item?.print_files.length ?? 0;
                return (
                  <tr key={o.id} className={(unlocked && !files) || latest?.status === "changes_requested" ? "bg-blade/15 hover:bg-blade/25" : "hover:bg-paper"}>
                    <td className="px-4 py-3">
                      <Link className="link font-semibold" href={`/admin/orders/${o.id}`}>{o.number}</Link>
                      <span className="block text-xs text-steel">{day.format(new Date(o.created_at))}{o.paid_at ? "" : ", unpaid"}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="block max-w-48 truncate">{o.profiles.full_name || o.profiles.email}</span>
                      <span className="block max-w-48 truncate text-xs text-steel">{o.profiles.company ?? o.profiles.email}</span>
                    </td>
                    <td className="px-4 py-3">
                      {item?.product_snapshot.name} × {item?.quantity.toLocaleString("en-GB")}
                      <span className="block text-xs text-steel">
                        {item?.product_snapshot.division}{item?.csv_rows ? `, CSV of ${item.csv_rows} rows` : ""}{item?.upload_kind ? `, ${item.upload_kind.toUpperCase()} upload` : ""}
                      </span>
                    </td>
                    <td className="px-4 py-3"><StageChip stage={o.status} /></td>
                    <td className="px-4 py-3 text-xs">{latest ? `v${latest.version} ${latest.status.replace("_", " ")}` : <span className="text-steel">none</span>}</td>
                    <td className="px-4 py-3">
                      {files ? <span className="chip bg-success/12 text-success">{files} ready</span>
                        : unlocked ? <span className="chip bg-warning/12 text-warning">Unlocked</span>
                          : <span className="chip bg-mist text-steel">Locked</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">{formatMoney(o.total_pence, o.currency)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length === 100 && <p className="border-t border-hairline px-4 py-2 text-xs text-steel">Showing the newest 100. Narrow the search to see older jobs.</p>}
        </div>
      ) : (
        <div className="panel p-6 text-sm">
          <p className="font-medium">No jobs match.</p>
          <p className="mt-1 text-steel">{archived ? "Completed orders appear here once archived from the job page." : "Try another stage, or clear the search."}</p>
        </div>
      )}
    </div>
  );
}
