/**
 * Xero sales-invoice CSV for paid orders in a date range. Admin only:
 * the role is checked here AND the orders query runs through RLS.
 */
import { getUser } from "@/lib/auth";
import { serverClient } from "@/lib/supabase/server";
import { xeroCsvAdapter, type ExportOrder } from "@/lib/accounting/xero";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request) {
  const user = await getUser();
  if (user?.role !== "admin") return new Response("Not found", { status: 404 });
  const sp = new URL(req.url).searchParams;
  const from = sp.get("from") ?? "", to = sp.get("to") ?? "";
  if (!DATE.test(from) || !DATE.test(to) || from > to) return new Response("Choose a valid date range.", { status: 400 });
  const toExclusive = new Date(new Date(to).getTime() + 86_400_000).toISOString();

  const supabase = await serverClient();
  const { data, error } = await supabase.from("orders")
    .select("number, paid_at, currency, vat_rate, profiles(full_name, company, email), order_items(quantity, line_total_pence, product_snapshot)")
    .not("paid_at", "is", null).gte("paid_at", from).lt("paid_at", toExclusive).order("paid_at");
  if (error) return new Response("Export failed.", { status: 500 });

  const orders: ExportOrder[] = (data ?? []).map((o) => {
    const p = o.profiles as unknown as { full_name: string | null; company: string | null; email: string };
    const items = o.order_items as unknown as Array<{ quantity: number; line_total_pence: number; product_snapshot: { name: string; material?: string } }>;
    return {
      number: o.number, paidAt: o.paid_at!, currency: o.currency, vatRate: Number(o.vat_rate),
      customerName: p.company || p.full_name || p.email, email: p.email,
      lines: items.map((i) => ({ description: `${i.product_snapshot.name}${i.product_snapshot.material ? ` (${i.product_snapshot.material})` : ""} × ${i.quantity}`, amountPence: i.line_total_pence })),
    };
  });
  const file = await xeroCsvAdapter.exportInvoices(orders);
  return new Response(file.body, {
    headers: { "Content-Type": `${file.mime}; charset=utf-8`, "Content-Disposition": `attachment; filename="${file.filename}"`, "Cache-Control": "private, no-store" },
  });
}
