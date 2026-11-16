/**
 * The site's own public address, used for links in emails and for the
 * Stripe return URLs. Order of preference:
 *   1. NEXT_PUBLIC_APP_URL, when set (production sets it to the live domain);
 *   2. on Vercel, the production domain for production builds, or this
 *      deployment's own URL for preview builds (Vercel sets these itself);
 *   3. localhost for `npm run dev`.
 * So a preview link sends customers back to the same preview, not to live.
 */
export function appUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const host =
    process.env.VERCEL_ENV === "production"
      ? process.env.VERCEL_PROJECT_PRODUCTION_URL
      : (process.env.VERCEL_BRANCH_URL ?? process.env.VERCEL_URL);
  return host ? `https://${host}` : "http://localhost:3000";
}
