/**
 * Staff production output, read-only: print files from a job in production
 * (named OrderID_ProductType_Date_Output, real PDF/PNG/SVG/ZIP bytes), the
 * customer locked out of them, and the Xero-ready export. Desktop only.
 */
import { expect, test } from "@playwright/test";
import { unzipSync } from "fflate";
import { admin, customer, signIn } from "./helpers";

test.skip(({ viewport }) => (viewport?.width ?? 0) < 1280, "Runs once, at desktop width.");

const MAGIC: Record<string, string> = { pdf: "%PDF", png: "\x89PNG", zip: "PK", svg: "<" };

test("staff download print files with the agreed names and real file contents", async ({ page, browser }) => {
  await signIn(page, admin);
  // Filter by stage and product type (race numbers carry a CSV), so the per-row merge is always checked.
  await page.goto("/admin?status=production&division=race-numbers");
  await page.locator('a[href^="/admin/orders/"]:visible').first().click();
  await expect(page.getByText("Ready for production")).toBeVisible({ timeout: 30_000 });

  const hrefs = await page.locator('a[href^="/files/print/"]').evaluateAll((as) => as.map((a) => a.getAttribute("href")!));
  expect(hrefs.length).toBeGreaterThanOrEqual(2);
  const names = await page.locator("#files-h").locator("xpath=ancestor::section[1]").locator("li span.block").allTextContents();
  expect(names.length).toBe(hrefs.length);
  console.log("print files:", names.map((n) => n.split(",")[0]).join(" | "));
  for (const n of names) expect(n.split(",")[0]).toMatch(/^DH-\d{6}_[a-z0-9-]+_\d{8}_[A-Za-z0-9-]+\.(pdf|png|svg|zip)$/);

  let sawZip = false;
  for (const href of hrefs) {
    const res = await page.request.get(href);
    expect(res.status(), href).toBe(200);
    const body = (await res.body()).subarray(0, 4).toString("latin1");
    const ext = Object.keys(MAGIC).find((e) => body.startsWith(MAGIC[e]));
    expect(ext, `${href} starts with ${JSON.stringify(body)}`).toBeTruthy();
    if (ext === "zip") {
      sawZip = true;
      // CSV merge: one print-ready PDF per row of the customer's list.
      const entries = Object.keys(unzipSync(new Uint8Array(await res.body())));
      console.log("zip entries:", entries.join(" | "));
      expect(entries.filter((e) => e.endsWith(".pdf")).length).toBeGreaterThanOrEqual(2);
    }
  }

  expect(sawZip, "a race-numbers job has a CSV merge ZIP").toBe(true);

  // The same links refuse a customer: print files are staff-only.
  const ctx = await browser.newContext();
  const other = await ctx.newPage();
  await signIn(other, customer);
  const res = await other.request.get(hrefs[0], { maxRedirects: 0 });
  expect(res.status()).toBe(404);
  await ctx.close();
});

test("staff export paid orders as a Xero sales-invoice CSV", async ({ page }) => {
  await signIn(page, admin);
  const res = await page.request.get("/admin/reports/xero?from=2026-01-01&to=2026-12-31");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-disposition"]).toContain(".csv");
  const csv = await res.text();
  expect(csv.split("\n")[0]).toContain("*ContactName");
  expect(csv).toMatch(/DH-\d{6}/);
});
