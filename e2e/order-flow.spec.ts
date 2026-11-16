/**
 * One full order: design, pay with Stripe's published test card, approve the
 * proof, and staff see that print files are next. It writes real rows (an
 * order, a proof, emails), so it only runs with E2E_PAY=1, on desktop.
 */
import { expect, test } from "@playwright/test";
import { admin, customer, signIn } from "./helpers";

test.skip(!process.env.E2E_PAY, "Set E2E_PAY=1 to run the paid order flow (writes to the database).");
test.skip(({ viewport }) => (viewport?.width ?? 0) < 1280, "Runs once, at desktop width.");
test.setTimeout(180_000);

test("design, pay, approve, and staff see the next step", async ({ page }) => {
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

  await page.getByRole("link", { name: "Review your proof" }).click();
  await expect(page.getByRole("button", { name: "Approve proof v1" })).toBeVisible({ timeout: 30_000 });
  await page.getByLabel(/I have checked spelling/).check();
  await page.getByRole("button", { name: "Approve proof v1" }).click();
  await expect(page.getByText("You approved this version.")).toBeVisible();

  await page.context().clearCookies();
  await signIn(page, admin);
  await page.goto(`/admin?q=${orderNumber}`);
  await page.getByRole("link", { name: orderNumber! }).click();
  // Approval makes the print files straight away; if that is still running, the page asks staff to generate them.
  await expect(page.getByRole("region", { name: "Next step" })).toContainText(/Print files are ready|Generate the print files/);
  await expect(page.getByRole("button", { name: "Move to In production" })).toBeVisible();
});
