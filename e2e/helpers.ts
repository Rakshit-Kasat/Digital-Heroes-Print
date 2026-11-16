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

/**
 * Nothing may stick out past the viewport. The page clips sideways overflow
 * (overflow-x: clip), so scrollWidth always looks fine; instead every element's
 * edges are checked, skipping content inside a box that scrolls on purpose
 * (tables) and visually hidden screen-reader text.
 */
export async function expectNoSidewaysScroll(page: Page) {
  const offenders = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const scrolls = (el: Element | null) => {
      for (let e = el; e && e !== document.body; e = e.parentElement) {
        const ox = getComputedStyle(e).overflowX;
        if (ox === "auto" || ox === "scroll") return true;
      }
      return false;
    };
    return [...document.body.querySelectorAll("*")]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        if (r.width <= 1 || r.height <= 1) return false;
        return (r.right > vw + 1 || r.left < -1) && !scrolls(el.parentElement);
      })
      .slice(0, 5)
      .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)}`);
  });
  expect(offenders, "elements stick out past the viewport").toEqual([]);
}

/** Full-page screenshot attached to the HTML report, named by page and width. */
export async function shoot(page: Page, info: TestInfo, name: string) {
  await info.attach(`${name}-${info.project.name}`, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
}
