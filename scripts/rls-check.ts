/**
 * RLS smoke test (PRD §12/§16): signs in as two different customers with the
 * PUBLIC key (exactly what a browser has) and proves neither can read the
 * other's order, nor write orders, nor read admin-only tables.
 * Creates one throwaway order via the service role and deletes it after.
 * Run: node scripts/rls-check.ts
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { DEMO_USERS } from "./seed.ts";

config({ path: ".env.local", quiet: true });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const service = createClient(url, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const publicClient = () => createClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });

const [adminU, custU, secondU] = DEMO_USERS;
let failures = 0;
const check = (name: string, ok: boolean) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) failures++;
};

async function signIn(email: string, password: string) {
  const c = publicClient();
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return { c, id: data.user.id };
}

const cust = await signIn(custU.email, custU.password);
const second = await signIn(secondU.email, secondU.password);
const admin = await signIn(adminU.email, adminU.password);

const { data: product } = await service.from("products").select("id").limit(1).single();
const { data: order, error } = await service.from("orders")
  .insert({ customer_id: cust.id, vat_rate: 0.2, subtotal_pence: 100, vat_pence: 20, total_pence: 120 })
  .select("id").single();
if (error) throw error;
await service.from("order_items").insert({
  order_id: order.id, product_id: product!.id, product_snapshot: {}, config: {}, quantity: 1, unit_price_pence: 100, line_total_pence: 100,
});

try {
  const own = await cust.c.from("orders").select("id").eq("id", order.id);
  check("owner can read own order", own.data?.length === 1);
  const other = await second.c.from("orders").select("id").eq("id", order.id);
  check("other customer cannot read it", other.data?.length === 0);
  const items = await second.c.from("order_items").select("id").eq("order_id", order.id);
  check("other customer cannot read its items", items.data?.length === 0);
  const write = await cust.c.from("orders").update({ total_pence: 1 }).eq("id", order.id).select("id");
  check("customer cannot change an order (price tampering)", (write.data?.length ?? 0) === 0);
  const ins = await cust.c.from("orders").insert({ customer_id: cust.id, vat_rate: 0.2, subtotal_pence: 0, vat_pence: 0, total_pence: 0 });
  check("customer cannot insert orders directly", !!ins.error);
  const role = await cust.c.from("profiles").update({ role: "admin" }).eq("id", cust.id).select("role");
  const { data: after } = await service.from("profiles").select("role").eq("id", cust.id).single();
  check("customer cannot promote self to admin", after?.role === "customer" && (role.error !== null || role.data?.[0]?.role !== "admin"));
  const pf = await cust.c.from("print_files").select("id");
  check("customer sees no print files", (pf.data?.length ?? 0) === 0);
  const logs = await cust.c.from("email_log").select("id");
  check("customer sees no email log", (logs.data?.length ?? 0) === 0);
  const adminRead = await admin.c.from("orders").select("id").eq("id", order.id);
  check("admin can read every order", adminRead.data?.length === 1);
  const anonProducts = await publicClient().from("products").select("id");
  check("anonymous visitors can browse the catalogue", (anonProducts.data?.length ?? 0) > 0);
  const anonOrders = await publicClient().from("orders").select("id");
  check("anonymous visitors see no orders", (anonOrders.data?.length ?? 0) === 0);
} finally {
  await service.from("orders").delete().eq("id", order.id);
}
console.log(failures ? `${failures} check(s) failed` : "all RLS checks passed");
process.exit(failures ? 1 : 0);
