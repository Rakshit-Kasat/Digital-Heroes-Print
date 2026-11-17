/**
 * One full order, as the PRD testing checklist walks it: design, pay with
 * Stripe's published test card, ask for changes on proof v1, staff send v2,
 * approve v2, print files unlock, staff move the job to production, and the
 * customer reorders. Plus a sign-up that removes its own account afterwards.
 * It writes real rows (orders, proofs, emails, a user), so it only runs with
 * E2E_PAY=1, on desktop.
 */
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { admin, customer, signIn } from "./helpers";

config({ path: ".env.local", quiet: true });

test.skip(!process.env.E2E_PAY, "Set E2E_PAY=1 to run the paid order flow (writes to the database).");
test.skip(({ viewport }) => (viewport?.width ?? 0) < 1280, "Runs once, at desktop width.");
test.setTimeout(240_000);

async function openJob(page: Page, orderNumber: string) {
  await page.goto(`/admin?q=${orderNumber}`);
  await page.getByRole("link", { name: orderNumber }).click();
  await expect(page.getByRole("heading", { name: "Next step" })).toBeVisible({ timeout: 30_000 });
}

/** Two-click staff actions: the first click arms the button, the second confirms. */
async function confirmAction(page: Page, submit: string, confirm: string) {
  await page.getByRole("button", { name: submit, exact: true }).click();
  await page.getByRole("button", { name: confirm, exact: true }).click();
}

test("design, pay, change v1, approve v2, production, reorder", async ({ page }) => {
  await signIn(page, customer);
  await page.goto("/products/labels-stickers/product-labels");
  await page.getByRole("button", { name: "Design it online" }).click();
  await page.waitForURL(/\/design\//);

  await page.getByRole("button", { name: /^Pay £[\d,.]+ securely$/ }).click();
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 });

  // Stripe's hosted checkout in test mode, with its published test card. The form sits in an iframe.
  const checkout = page.frameLocator("iframe").first();
  await checkout.getByRole("button", { name: "Card", exact: true }).click();
  await checkout.getByRole("textbox", { name: "Card number" }).fill("4242 4242 4242 4242");
  await checkout.getByRole("textbox", { name: /Expiration/ }).fill("12 / 34");
  await checkout.getByRole("textbox", { name: "Security code" }).fill("123");
  await checkout.getByRole("textbox", { name: "Name on card" }).fill("Charlie Customer");
  const postcode = checkout.getByRole("textbox", { name: /Postal code|Postcode|ZIP/ });
  if (await postcode.isVisible().catch(() => false)) await postcode.fill("SW1A 1AA");
  await checkout.getByRole("button", { name: "Pay", exact: true }).click();

  await page.waitForURL(/\/checkout\/success/, { timeout: 60_000 });
  await expect(page.getByRole("heading", { level: 1 })).toContainText("is confirmed");
  const orderNumber = (await page.getByRole("heading", { level: 1 }).textContent())?.match(/DH-\d+/)?.[0];
  expect(orderNumber).toBeTruthy();

  // Customer asks for changes on v1.
  await page.getByRole("link", { name: "Review your proof" }).click();
  await page.waitForURL(/\/account\/orders\//);
  const orderUrl = page.url();
  // Payment and proof v1 are handled a moment apart; the page says so and asks for a refresh.
  await expect(async () => {
    if (await page.getByText("still being sent to you").isVisible()) await page.reload();
    await expect(page.getByRole("button", { name: "Approve proof v1" })).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 45_000 });
  await page.getByRole("tab", { name: "I want changes" }).click();
  await page.getByLabel("What should we change?").fill("E2E: make the product name larger.");
  await page.getByRole("button", { name: "Send change request" }).click();
  await expect(page.getByText("We have your change request")).toBeVisible({ timeout: 30_000 });

  // Staff: print files stay locked while no proof is approved; send v2.
  await page.context().clearCookies();
  await signIn(page, admin);
  await openJob(page, orderNumber!);
  await expect(page.getByRole("region", { name: "Next step" })).toContainText("asked for changes to v1");
  await expect(page.getByText("Locked until a proof is approved")).toBeVisible();
  await expect(page.getByText(/E2E: make the product name larger/).first()).toBeVisible();
  await page.getByLabel(/Note sent with this proof/).fill("E2E: name enlarged.");
  await confirmAction(page, "Send a new proof from the design", "Confirm: send new version");
  await expect(page.getByText(/Latest is v2/)).toBeVisible({ timeout: 30_000 });

  // Customer approves v2, which unlocks and makes the print files.
  await page.context().clearCookies();
  await signIn(page, customer);
  await page.goto(orderUrl);
  await page.getByLabel(/I have checked spelling/).check();
  await page.getByRole("button", { name: "Approve proof v2" }).click();
  await expect(page.getByText("You approved this version.")).toBeVisible({ timeout: 30_000 });

  // Staff move the job to production.
  await page.context().clearCookies();
  await signIn(page, admin);
  await openJob(page, orderNumber!);
  await expect(page.getByRole("region", { name: "Next step" })).toContainText(/Print files are ready|Generate the print files/);
  await expect(page.getByText(/approved by/).first()).toBeVisible(); // approval log entry
  await confirmAction(page, "Move to In production", "Confirm: In production");
  await expect(page.getByRole("region", { name: "Next step" })).toContainText("In production", { timeout: 30_000 });

  // Customer sees production and reorders: same artwork, fresh price, straight to payment.
  await page.context().clearCookies();
  await signIn(page, customer);
  await page.goto(orderUrl);
  await expect(page.getByRole("list", { name: /Progress: stage 5 of 6/ })).toBeAttached();
  await page.getByRole("button", { name: "Reorder this job" }).click();
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 });
  console.log(`order flow: ${orderNumber} went v1 changes, v2 approved, production, reorder reached Stripe`);
});

test("designer keeps artwork inside the print area when dragged or typed out of it", async ({ page }) => {
  await signIn(page, customer);
  await page.goto("/products/labels-stickers/product-labels");
  await page.getByRole("button", { name: "Design it online" }).click();
  await page.waitForURL(/\/design\//);
  await page.getByRole("button", { name: "Add text" }).click();

  const field = (name: string) => page.getByLabel(name, { exact: true });
  const box = async () => ({ x: Number(await field("X").inputValue()), y: Number(await field("Y").inputValue()), w: Number(await field("Width").inputValue()), h: Number(await field("Height").inputValue()) });
  // The trim is 90 x 60 mm by default for product labels; the safe area sits inside it.
  const inside = (b: { x: number; y: number; w: number; h: number }) => b.x >= 0 && b.y >= 0 && b.x + b.w <= 90 && b.y + b.h <= 60;

  // Typed coordinates far outside are pulled back in.
  await field("X").fill("-500");
  await field("Y").fill("900");
  await expect.poll(async () => inside(await box())).toBe(true);

  // Dragging the element far off the artboard stops at the edge of the print area.
  const start = await box();
  const svg = page.getByRole("img").filter({ has: page.locator("path") }).first();
  const rect = (await svg.boundingBox())!;
  const vb = (await svg.getAttribute("viewBox"))!.split(/\s+/).map(Number);
  const toScreen = (mmX: number, mmY: number) => ({ x: rect.x + ((mmX - vb[0]) * rect.width) / vb[2], y: rect.y + ((mmY - vb[1]) * rect.height) / vb[3] });
  const from = toScreen(start.x + start.w / 2, start.y + start.h / 2);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 1500, from.y - 1500, { steps: 12 }); // the typed check left it bottom-left, so go top-right
  await page.mouse.up();
  const after = await box();
  console.log("designer drag:", JSON.stringify(start), "->", JSON.stringify(after));
  expect(after).not.toEqual(start); // it did move
  expect(inside(after)).toBe(true);
});

test("a new customer can sign up, and the test account is removed after", async ({ page }) => {
  const email = `e2e-${Date.now()}@dhprint.test`;
  const password = `e2e-${crypto.randomUUID()}`; // throwaway, never stored
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
  try {
    await page.goto("/signup");
    await page.getByLabel("Your name").fill("E2E Signup");
    await page.getByLabel(/Company or club/).fill("E2E Running Club");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Create account" }).click();
    await page.waitForURL((u) => !u.pathname.startsWith("/signup"));
    await page.goto("/account");
    await expect(page).toHaveURL(/\/account/);
    const { data } = await db.from("profiles").select("role, full_name, company").eq("email", email).single();
    expect(data).toEqual({ role: "customer", full_name: "E2E Signup", company: "E2E Running Club" });
  } finally {
    const { data } = await db.from("profiles").select("id").eq("email", email).maybeSingle();
    if (data) await db.auth.admin.deleteUser(data.id);
  }
});
