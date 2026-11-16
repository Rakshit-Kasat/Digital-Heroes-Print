/** Shared steps for the e2e suite: demo sign-in and the "no sideways scroll" check. */
import { expect, type Page, type TestInfo } from "@playwright/test";
import { DEMO_USERS } from "../scripts/seed.ts";

export const customer = DEMO_USERS.find((u) => u.email === "customer@dhprint.test")!;
export const admin = DEMO_USERS.find((u) => u.role === "admin")!;

export async function signIn(page: Page, user: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

/** The page body must never scroll sideways; only tables scroll inside their own box. */
export async function expectNoSidewaysScroll(page: Page) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(over, "page is wider than the viewport").toBeLessThanOrEqual(0);
}

/** Full-page screenshot attached to the HTML report, named by page and width. */
export async function shoot(page: Page, info: TestInfo, name: string) {
  await info.attach(`${name}-${info.project.name}`, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
}
