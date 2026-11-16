/** Guest pages: the mat, the configurator's live price, sign-in walls and the 404. Read-only. */
import { expect, test } from "@playwright/test";
import { expectNoSidewaysScroll, shoot } from "./helpers";

test("home lays one piece per product family on the mat", async ({ page }, info) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Print you can measure before you order.");
  const mat = page.getByRole("region", { name: "What we make" });
  await expect(mat.getByRole("link")).toHaveCount(6);
  await expect(page.getByRole("link", { name: "Get a price" })).toBeVisible();
  await expectNoSidewaysScroll(page);
  await shoot(page, info, "home");
});

test("product page price follows the quantity", async ({ page }, info) => {
  await page.goto("/products/race-numbers/race-bibs");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Race bibs");
  const quantity = page.getByLabel("Quantity");
  const price = page.getByText(/Includes £[\d,.]+ VAT/);
  await quantity.fill("100");
  const before = await price.textContent();
  await quantity.fill("1000");
  await expect(price).not.toHaveText(before ?? "");
  await expect(page.getByText("your quantity")).toBeVisible();
  await expectNoSidewaysScroll(page);
  await shoot(page, info, "bibs");
});

test("every family page and the gallery open without sideways scroll", async ({ page }) => {
  for (const path of ["/products", "/products/labels-stickers", "/products/mtb-boards", "/products/laser-cut", "/gallery"]) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(200);
    await expectNoSidewaysScroll(page);
  }
});

test("account and staff pages ask a guest to sign in", async ({ page }) => {
  for (const path of ["/account", "/admin"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login/);
  }
});

test("unknown address shows the 404 page", async ({ page }) => {
  const res = await page.goto("/no-such-page");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("We can't find that page");
});
