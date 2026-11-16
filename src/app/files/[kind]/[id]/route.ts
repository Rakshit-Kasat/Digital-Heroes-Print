/**
 * The ONE way a file leaves private storage. Every bucket is private; this
 * route looks the row up AS THE SIGNED-IN USER (RLS decides what they may
 * see), then redirects to a signed URL that expires in 60 seconds.
 *
 *   /files/invoice/<orderId>   customer (own order) or admin
 *   /files/proof/<proofId>     customer (own order) or admin
 *   /files/print/<fileId>      admin only (print_files has no customer policy)
 *   /files/artwork/<itemId>    admin only: the customer's original upload
 *   /files/csv/<itemId>        admin only: the variable-data CSV
 *
 * A customer asking for a print file gets 404: RLS returns no row, so
 * there is nothing to sign. Customers never receive production files.
 */
import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { serverClient } from "@/lib/supabase/server";
import { signedUrl } from "@/lib/storage";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: Request, ctx: RouteContext<"/files/[kind]/[id]">) {
  const { kind, id } = await ctx.params;
  const user = await getUser();
  if (!user) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(new URL(req.url).pathname)}`, req.url));
  if (!UUID.test(id)) return notFound();
  const supabase = await serverClient();
  const inline = new URL(req.url).searchParams.has("view");

  let path: string | null = null;
  let name: string | undefined;
  if (kind === "invoice") {
    const { data } = await supabase.from("invoices").select("number, pdf_path").eq("order_id", id).maybeSingle();
    if (data) { path = data.pdf_path; name = `${data.number}.pdf`; }
  } else if (kind === "proof") {
    const { data } = await supabase.from("proofs").select("version, png_path, order_items(orders(number))").eq("id", id).maybeSingle();
    if (data) {
      const number = (data.order_items as unknown as { orders: { number: string } } | null)?.orders.number ?? "proof";
      path = data.png_path; name = `${number}_proof_v${data.version}.png`;
    }
  } else if (kind === "print" && user.role === "admin") {
    const { data } = await supabase.from("print_files").select("path").eq("id", id).maybeSingle();
    if (data) { path = data.path; name = data.path.split("/").pop(); }
  } else if ((kind === "artwork" || kind === "csv") && user.role === "admin") {
    const { data } = await supabase.from("order_items").select("upload_path, csv_path, orders(number)").eq("id", id).maybeSingle();
    const p = kind === "artwork" ? data?.upload_path : data?.csv_path;
    if (data && p) {
      const number = (data.orders as unknown as { number: string } | null)?.number ?? "order";
      path = p; name = `${number}_${kind === "artwork" ? "customer-artwork" : "names"}.${p.split(".").pop()}`;
    }
  }
  if (!path) return notFound();

  const url = await signedUrl(path, 60, inline ? undefined : name);
  if (!url) return notFound();
  return NextResponse.redirect(url, { headers: { "Cache-Control": "private, no-store" } });
}

function notFound() {
  return new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
}
