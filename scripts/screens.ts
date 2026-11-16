/**
 * Screenshot every screen at phone and desktop width, signed out, as a
 * customer and as staff. Used for the redesign's before/after record.
 * Needs the dev server on http://localhost:3000 (local only: it signs in
 * with the seeded test accounts).
 * Run: node scripts/screens.ts <out-dir>      e.g. docs/redesign/before
 */
import { mkdirSync } from "node:fs";
import { chromium, type Browser, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { DEMO_USERS } from "./seed.ts";

config({ path: ".env.local", quiet: true });
const BASE = "http://localhost:3000";
const out = process.argv[2] ?? "docs/redesign/shots";
mkdirSync(out, { recursive: true });

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const qa = DEMO_USERS.find((u) => u.email.startsWith("g2hklic+"))!;
const admin = DEMO_USERS.find((u) => u.role === "admin")!;
const { data: prof } = await db.from("profiles").select("id").eq("email", qa.email).single();
const { data: order } = await db.from("orders").select("id").eq("customer_id", prof!.id).not("paid_at", "is", null).order("created_at", { ascending: false }).limit(1).single();
const { data: design } = await db.from("designs").select("id").eq("owner_id", prof!.id).eq("is_saved", true).limit(1).single();

const SIZES = { phone: { width: 375, height: 812 }, desktop: { width: 1280, height: 800 } };
const groups: Array<{ who: "guest" | "customer" | "admin"; routes: Record<string, string> }> = [
  { who: "guest", routes: {
    home: "/", products: "/products", division: "/products/labels-stickers", product: "/products/labels-stickers/product-labels",
    bibs: "/products/race-numbers/race-bibs", gallery: "/gallery", login: "/login", signup: "/signup", notfound: "/no-such-page",
  } },
  { who: "customer", routes: { account: "/account", order: `/account/orders/${order!.id}`, designer: `/design/${design!.id}` } },
  { who: "admin", routes: { jobs: "/admin", job: `/admin/orders/${order!.id}`, users: "/admin/users", catalogue: "/admin/products", reports: "/admin/reports" } },
];

async function signIn(page: Page, email: string, password: string) {
  await page.goto(`${BASE}/login`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

const browser: Browser = await chromium.launch();
for (const g of groups) {
  for (const [size, viewport] of Object.entries(SIZES)) {
    const ctx = await browser.newContext({ viewport, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    if (g.who === "customer") await signIn(page, qa.email, qa.password);
    if (g.who === "admin") await signIn(page, admin.email, admin.password);
    for (const [name, path] of Object.entries(g.routes)) {
      await page.goto(BASE + path, { waitUntil: "networkidle" });
      await page.screenshot({ path: `${out}/${name}-${size}.png`, fullPage: true });
      console.log("shot", name, size);
    }
    await ctx.close();
  }
}
await browser.close();
