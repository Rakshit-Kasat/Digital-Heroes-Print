/** Signed-in screens for a customer and for staff. Read-only: nothing is clicked that writes. */
import { expect, test } from "@playwright/test";
import { admin, customer, expectNoSidewaysScroll, shoot, signIn } from "./helpers";

test("customer account leads with proofs, then orders", async ({ page }, info) => {
  await signIn(page, customer);
  await page.goto("/account");
  const headings = page.getByRole("heading", { level: 2 });
  await expect(headings.first()).toHaveText("Proofs to review");
  await expect(page.getByRole("heading", { name: "Orders" })).toBeVisible();
  await expectNoSidewaysScroll(page);
  await shoot(page, info, "account");

  const firstOrder = page.getByRole("table").getByRole("link").first();
  await firstOrder.click();
  await expect(page.getByRole("list", { name: /Progress: stage \d of 6/ })).toBeAttached();
  await expectNoSidewaysScroll(page);
  await shoot(page, info, "order");
});

test("customer cannot open the staff console", async ({ page }) => {
  await signIn(page, customer);
  await page.goto("/admin");
  await expect(page).not.toHaveURL(/\/admin/);
});

test("staff job page states the next step first", async ({ page }, info) => {
  await signIn(page, admin);
  await page.goto("/admin");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Job board");
  await shoot(page, info, "jobs");

  await page.getByRole("table").getByRole("link").first().click();
  await expect(page.getByRole("heading", { name: "Next step" })).toBeVisible();
  // The two proof forms each name their own note field.
  await expect(page.getByLabel(/Note sent with this proof/)).toBeVisible();
  await expect(page.getByLabel(/Note sent with this upload/)).toBeVisible();
  await expectNoSidewaysScroll(page);
  await shoot(page, info, "job");
});

test("staff tables scroll inside their own box, not the page", async ({ page }) => {
  await signIn(page, admin);
  for (const path of ["/admin/users", "/admin/products", "/admin/reports"]) {
    await page.goto(path);
    await expectNoSidewaysScroll(page);
  }
});
