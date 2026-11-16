/**
 * Reports & analytics (PRD §11.05): orders, revenue and product-family
 * throughput, read from SQL views (security_invoker, so RLS still applies),
 * plus the Xero-ready sales-invoice export.
 */
import type { Metadata } from "next";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";
import { serverClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/pricing/calculate";
import { STAGES, STAGE_LABEL } from "@/lib/orders/pipeline";

export const metadata: Metadata = { title: "Reports" };
const monthFmt = new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });

export default function ReportsPage() {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-lg bg-mist" aria-label="Loading reports" />}>
      <Reports />
    </Suspense>
  );
}

async function Reports() {
  await requireAdmin();
  const supabase = await serverClient();
  const [{ data: months }, { data: byStatus }, { data: divisions }, { data: paid }] = await Promise.all([
    supabase.from("report_revenue_by_month").select("month, orders, revenue_pence").limit(12),
    supabase.from("report_orders_by_status").select("status, orders"),
    supabase.from("report_division_throughput").select("division, orders, units, revenue_ex_vat_pence"),
    supabase.from("orders").select("total_pence, subtotal_pence, vat_pence").not("paid_at", "is", null),
  ]);
  const totals = (paid ?? []).reduce((a, o) => ({ n: a.n + 1, gross: a.gross + o.total_pence, net: a.net + o.subtotal_pence, vat: a.vat + o.vat_pence }), { n: 0, gross: 0, net: 0, vat: 0 });
  const maxMonth = Math.max(1, ...(months ?? []).map((m) => Number(m.revenue_pence)));
  const maxDiv = Math.max(1, ...(divisions ?? []).map((d) => Number(d.revenue_ex_vat_pence)));
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = `${today.slice(0, 8)}01`;

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-extrabold">Reports</h1>

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[["Paid orders", totals.n.toLocaleString("en-GB")], ["Revenue inc VAT", formatMoney(totals.gross)], ["Revenue ex VAT", formatMoney(totals.net)], ["Average order", formatMoney(totals.n ? Math.round(totals.gross / totals.n) : 0)]].map(([k, v]) => (
          <div key={k} className="panel p-4">
            <dt className="text-sm text-steel">{k}</dt>
            <dd className="mt-1 text-2xl font-bold">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="rev-h" className="panel p-5">
          <h2 id="rev-h" className="text-lg font-bold">Revenue by month</h2>
          {months?.length ? (
            <table className="mt-3 w-full text-sm">
              <thead className="sr-only"><tr><th>Month</th><th>Revenue</th><th>Orders</th></tr></thead>
              <tbody>
                {months.map((m) => (
                  <tr key={m.month}>
                    <td className="w-24 py-1.5 pr-3 text-steel">{monthFmt.format(new Date(m.month))}</td>
                    <td className="py-1.5">
                      <div className="h-5 rounded-sm bg-accent" style={{ width: `${Math.max(2, (Number(m.revenue_pence) / maxMonth) * 100)}%` }} aria-hidden />
                    </td>
                    <td className="w-40 py-1.5 pl-3 text-right"><span className="font-semibold">{formatMoney(Number(m.revenue_pence))}</span> <span className="text-xs text-steel">· {m.orders}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="mt-2 text-sm text-steel">No paid orders yet.</p>}
        </section>

        <section aria-labelledby="stage-h" className="panel p-5">
          <h2 id="stage-h" className="text-lg font-bold">Live jobs by stage</h2>
          <dl className="mt-3 grid grid-cols-[1fr_auto] gap-y-1.5 text-sm">
            {STAGES.map((s) => (
              <div key={s} className="contents">
                <dt className="text-steel">{STAGE_LABEL[s]}</dt>
                <dd className="text-right font-semibold">{byStatus?.find((b) => b.status === s)?.orders ?? 0}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs text-steel">Quotes are checkouts that were started but not paid.</p>
        </section>
      </div>

      <section aria-labelledby="div-h" className="panel p-5">
        <h2 id="div-h" className="text-lg font-bold">Throughput by product family</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="text-left text-steel">
              <tr><th className="py-1.5 font-medium">Family</th><th className="py-1.5 text-right font-medium">Orders</th><th className="py-1.5 text-right font-medium">Units</th><th className="py-1.5 pl-4 font-medium">Revenue ex VAT</th></tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {(divisions ?? []).map((d) => (
                <tr key={d.division}>
                  <td className="py-2">{d.division}</td>
                  <td className="py-2 text-right">{d.orders}</td>
                  <td className="py-2 text-right">{Number(d.units).toLocaleString("en-GB")}</td>
                  <td className="py-2 pl-4">
                    <div className="flex items-center gap-3">
                      <div className="h-3 rounded-sm bg-ink" style={{ width: `${Math.max(1, (Number(d.revenue_ex_vat_pence) / maxDiv) * 60)}%` }} aria-hidden />
                      <span className="whitespace-nowrap">{formatMoney(Number(d.revenue_ex_vat_pence))}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="xero-h" className="panel p-5">
        <h2 id="xero-h" className="text-lg font-bold">Accounting export</h2>
        <p className="mt-1 max-w-2xl text-sm text-steel">Paid orders as a CSV in Xero&apos;s &ldquo;Import sales invoices&rdquo; format (account 200, 20% VAT on Income). The export is built behind an adapter, so a live Xero API connection can replace it later.</p>
        <form action="/admin/reports/xero" method="get" className="mt-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="label" htmlFor="xf">Paid from</label>
            <input className="field" id="xf" name="from" type="date" defaultValue={monthStart} required />
          </div>
          <div>
            <label className="label" htmlFor="xt">Paid to</label>
            <input className="field" id="xt" name="to" type="date" defaultValue={today} required />
          </div>
          <button className="btn-primary py-2">Download Xero CSV</button>
        </form>
      </section>
    </div>
  );
}
