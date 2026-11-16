# Decisions

The PRD leaves a number of points open. This file records each choice, why it was made, and where it lives in the code, so it can be changed in one place.

## Money and pricing

| Question | Decision | Why | Where |
|---|---|---|---|
| Currency | **GBP** | UK print house; Stripe account is UK. | `NEXT_PUBLIC_CURRENCY`, `orders.currency` |
| VAT | **20%**, shown as its own line on the quote, in Stripe and on the invoice | UK standard rate. The rate is a setting, and each order stores the rate it was charged at. | `NEXT_PUBLIC_VAT_RATE`, `orders.vat_rate` |
| How money is stored | **Whole pence (integers)**, never floats | Avoids rounding drift (0.1 + 0.2). Only the unit price shown to a customer can be fractional (for example £0.043 a label). | `src/lib/pricing/calculate.ts` |
| Price formula | `unit = max(minimum, base + area_cm² × rate) × material multiplier`; `items = round(unit × qty × (1 − tier discount))`; `subtotal = items + setup fee`; `VAT = round(subtotal × 20%)` | Area pricing fits every division (a stamp and an MTB board use the same maths with different rates). The setup fee covers plate, die or machine set-up, as print houses usually charge. | `calculatePrice()` |
| Volume tiers | Per product, stored in the database. Example (labels): 100+ 10%, 250+ 15%, 500+ 20%, 1,000+ 30%, 5,000+ 40% | Different products have different break points; staff can edit them without a deploy (Admin → Products). The configurator shows "order N more to save X%". | `products.pricing.tiers` |
| Who decides the price | **The server**, at checkout, from the database | The browser price is for display only. A tampered request cannot change what Stripe charges. | `createOrderFromDesign()` |
| Payment check | The Stripe amount and currency must equal the order total before the order is marked paid | Catches any mismatch between what was charged and what was ordered. | `markPaid()` |

## Print files

| Question | Decision | Why |
|---|---|---|
| Bleed | Per product: **2 mm** labels/stickers, **3 mm** race bibs and MTB boards, **0 mm** stamps, trophy plates and laser-cut | Printed edge-to-edge items need bleed; engraved, cut and stamped items are cut on the line, so bleed would be wrong. |
| Safe area | Per product, 1.5–8 mm | Larger on items that get punched or cable-tied (MTB boards). |
| Resolution | **300 dpi** for print, **600 dpi** for stamps, trophies and laser-cut | Fine detail on rubber, metal and acrylic needs more. |
| Output formats | PDF (vector, with bleed and crop marks), PNG at the product dpi, SVG; ZIP of one PDF per CSV row for variable data | PDF is what presses take; PNG and SVG cover digital and laser workflows. |
| File naming | `OrderID_ProductType_Date_Output.ext`, for example `DH-001005_product-labels_20261116_Print.pdf` | Taken from the PRD's own pattern. Stored under `print-files/orders/<order number>/`. |
| What prints | Only the **approved proof's frozen copy** of the design | The proof stores its own document, so later edits to the design cannot change an approved job. |
| When files can be made | Only after a proof is approved | Enforced in code and in the database (Production needs an approved proof). |

## Artwork and uploads

| Question | Decision | Why |
|---|---|---|
| Accepted uploads | PDF, SVG, PNG, JPG, AI; up to 15 MB | The PRD's list. The first bytes of each file are checked, so a renamed file is rejected. |
| AI files | Stored and **flagged for a staff check**; staff send the proof by hand | No reliable open-source AI renderer runs on serverless. Modern AI files are PDF-compatible, so prepress can open them. |
| PDF uploads | Also proofed by staff | Same reason: multi-page PDFs need a person to choose the page. |
| PNG/SVG uploads | Proofed automatically; a PNG below the product dpi at the chosen size shows a low-resolution warning | The warning uses the pixel size read from the file header, not the browser's claim. |
| CSV variable data | Race bibs, MTB boards, trophy plates. Up to **1,000 rows** per order line; every row is checked for fit on upload; the row count is recounted on the server at checkout and must not exceed the quantity | 1,000 rows fits one serverless run comfortably. Larger events can be split into several orders. |
| Text that doesn't fit | Shrinks between the template's min and max size, then tightens letter spacing, then warns | The same fitting code runs in the browser, the proof and the CSV merge. |

## Accounts and email

| Question | Decision | Why |
|---|---|---|
| Sign-up confirmation | Accounts are **confirmed at once** | Reviewers can order immediately without a mailbox. In production this should become email confirmation (see Known limits). |
| Roles | `customer` and `admin` | The PRD's two roles. A database trigger stops anyone promoting themselves, and the last admin cannot be removed. |
| Email sender | **Gmail SMTP** with an App Password, via `nodemailer` | Free, and delivers to any address (Resend's free tier only sends to the account owner). Every attempt is logged in `email_log`. |
| Emails sent | To the customer: order confirmed, proof ready, stage changes (production, completed). To the studio: new order, proof approved, changes requested | Covers each point where the customer or the studio needs to act. |
| Corporate accounts | `organizations` table and `profiles.organization_id` exist but are not used yet | Leaves room for several buyers under one invoice without a schema change. |

## Accounting

| Question | Decision | Why |
|---|---|---|
| Xero | **CSV export** in Xero's sales-invoice import format (Admin → Reports) | Works without a Xero app review or OAuth. The exporter sits behind a small interface so a live Xero API client can replace it. |

## Design and UI

| Question | Decision | Why |
|---|---|---|
| Visual direction | "Boutique industrial": paper and ink colours, one magenta accent (press magenta), Red Hat Display / Red Hat Text | Picked from three directions. It looks like a print shop, not a template. |
| Component library | **No shadcn/ui** | Its `init` replaces the project's design tokens with the stock look the brief asked to avoid. Components are hand-built on Tailwind instead. The Vercel *web-design-guidelines* skill was used to audit the UI (after a safety check). |
| Designer | Own SVG designer, no canvas library | The same layout engine draws the browser preview, the proof and the print files, so the approved proof and the printed file cannot differ. |

## Known limits (honest list)

These are deliberate scope cuts for a two-day build. Each has a clear next step.

1. **Reports and Xero export read up to 1,000 rows** (Supabase's default page). Next: page through results or aggregate in SQL.
2. **Proof version race:** two staff sending a proof at the same second could both try the same version number; the database's unique key rejects the second, which then has to retry. Next: a database function that picks the version.
3. **Order creation is two inserts** (order, then item), not one transaction. A failure between them leaves an unpaid quote with no item, which is harmless but untidy. Next: one RPC.
4. **CSV merge runs after the response** (`after()`), not on a job queue. Fine for 1,000 rows; a queue (for example Inngest or Supabase Queues) would be needed for very large events.
5. **`unit_price_pence` is a whole number**, so a £0.043 label is stored as 4p. Totals are exact (they come from `line_total_pence`); only that one display column is rounded.
6. **No rate limit or CAPTCHA on sign-in and sign-up**, and sign-up does not confirm the email address. Next: Cloudflare Turnstile and Supabase email confirmation.
7. **The Stripe webhook does its work inline** (invoice, proof, emails) before replying. It is safe to repeat (the order is claimed once), and Stripe retries on failure. Next: store event IDs and hand the work to a queue.
8. **Supabase session cookies are readable by page scripts** (the library's default, needed for browser uploads). React escapes all output, so there is no known script injection point. Next: server-issued signed upload URLs, then httpOnly cookies.
9. **Demo passwords are in `README.md` and `scripts/seed.ts`** because the brief asks for test and admin credentials. If the repository is made public, change them afterwards (`npm run db:seed` with new values).
