# Digital Heroes Print — web-to-print platform

A working web-to-print shop for a UK print house with six product families: labels & stickers, race & event numbers, MTB boards, stamps, trophies and laser-cut work.
A customer configures a product, sees the price as they type, and either designs it in the browser or uploads a file.
They pay by card, approve a versioned proof, and can reorder in one click. Staff run every job through a six-stage pipeline and download print-ready files made on the server.

**Live:** https://digital-heroes-print.vercel.app
(Stripe is in test mode, so no real money moves.)

## Test accounts

| Role | Email | Password |
|---|---|---|
| Admin (staff) | `admin@dhprint.test` | `Heroes-Admin-2026!` |
| Customer | `customer@dhprint.test` | `Heroes-Customer-2026!` |
| Second customer (for privacy checks) | `second@dhprint.test` | `Heroes-Second-2026!` |

You can also create a new account at `/signup`. New accounts are confirmed at once, so you can order immediately.

**Test card:** `4242 4242 4242 4242`, any future expiry date, any CVC.

## How a job moves

```
Quote ─▶ Order ─▶ Artwork ─▶ Proof ─▶ Production ─▶ Completed
(checkout  (paid)   (design or  (customer   (needs an      (archive)
 started)           upload in)   approves)   approved proof)
```

1. **Configure:** pick a size, material and quantity on a product page. The price updates with every change (`src/lib/pricing/calculate.ts`).
2. **Design or upload:**
   - **Design:** the browser designer (`src/app/design/[id]`) keeps every object inside the print area and shrinks text to fit.
   - **Upload:** PDF, SVG, PNG, JPG and AI files are accepted.
3. **Pay:** Stripe Checkout. The server recalculates the price and never trusts the browser.
   - Payment is confirmed twice, by the success page and by the Stripe webhook. Whichever runs first claims the order; the second does nothing (`markPaid` + `fulfil` in `src/lib/orders/service.ts`).
   - Paying issues the invoice PDF, sends the emails and creates proof v1.
4. **Proof:**
   - The customer approves the proof or asks for changes with a note.
   - Staff can regenerate the proof from the design or upload a corrected one. Each change makes a new version (v2, v3…), and every decision is logged.
5. **Print files:** on approval, the server builds the files from exactly the approved artwork:
   - a PDF with bleed and crop marks, a 300/600 dpi PNG and an SVG;
   - a ZIP with one file per CSV row for race numbers;
   - the original file, for customer uploads.

   Files are named `OrderID_ProductType_Date_Output` and stored under `print-files/orders/<order number>/`.
6. **Production → Completed:** the database refuses Production without an approved proof. Completed jobs can be archived.

## Main features

**Customers** (`/account`):
- profile, proofs waiting for review, order history with stage tracker;
- invoice downloads, saved designs, one-click reorder (new price, same artwork).

**Staff** (`/admin`):
- **Job board:** filters by stage, customer, product family and date, an archive view, and a "files ready" badge.
- **Job page:** move stages, regenerate or upload proofs, generate and download print files, and see the history and email log.
- **Other pages:** users (promote or demote; the last admin can't be removed), products and prices (edit rates and tiers, show or hide templates), reports (revenue, stages, product-family throughput) and Xero sales-invoice CSV export.

## Stack

| Layer | Choice |
|---|---|
| App | Next.js 16 (App Router, Cache Components / partial prerendering, Server Actions), React 19, TypeScript, Tailwind CSS 4 |
| Data, auth, files | Supabase: Postgres with Row Level Security on every table, Auth, private Storage buckets |
| Payments | Stripe Checkout + signed webhook (GBP, 20% VAT as separate lines) |
| Print engine | Own layout engine (`src/lib/design`, `src/lib/layout`) shared by the browser and the server; `pdf-lib` for PDF, `@resvg/resvg-js` for PNG, `papaparse` + `fflate` for CSV merge |
| Email | `nodemailer` over Gmail SMTP; every send is logged in `email_log` |
| Hosting | Vercel |
| Tests | Vitest (`npm test`) + `scripts/rls-check.ts` (privacy between two customers) |

## Database schema

All tables are in `supabase/migrations/0001_init.sql`, with later migrations alongside. RLS is on for every table.
The helper `is_admin()` is used in the policies: customers see only their own rows, and staff see everything.

| Table | What it holds |
|---|---|
| `profiles` | One row per user: name, company, phone, role (`customer` / `admin`). Triggers stop a customer changing their own role and stop the last admin being removed. |
| `organizations` | Placeholder for future company accounts (several buyers, one invoice). |
| `divisions` | The six product families. A new family is a new row, not new code. |
| `products` | Size limits, presets, materials (price multipliers), quantity limits (`config_schema`), pricing rules (`pricing`), bleed, safe area, dpi, CSV support. |
| `templates` | Ready-made layouts per product, with text-fitting rules for each placeholder. |
| `designs` | A customer's design document (in mm) or uploaded file; `is_saved` shows it under "Saved designs". |
| `orders` | Number `DH-000123`, stage (`order_status` enum), money in integer pence (subtotal, VAT, total), Stripe ids, paid / archived dates, `reorder_of`. |
| `order_items` | Product snapshot at the time of order, configuration, quantity, unit and line price, discount, CSV file and row count. |
| `proofs` | Versioned proofs per item (`unique(order_item_id, version)`), status pending / approved / changes requested / superseded. |
| `proof_events` | Approval log: who approved or asked for changes, when, and their note. |
| `order_events` | Stage history: from, to, who, when, note. |
| `print_files` | Generated print files (pdf / png / svg / zip / source). Staff only. |
| `invoices` | Invoice number and PDF path per order. |
| `email_log` | Every email attempt with its status and error. |

**Views** (`security_invoker`, so RLS still applies): `report_revenue_by_month`, `report_orders_by_status`, `report_division_throughput`.

**Storage buckets**, all private, served through 60-second signed links from `/files/[kind]/[id]`:

| Bucket | Holds | Access |
|---|---|---|
| `uploads` | Customer artwork | Each user's own folder |
| `proofs` | Proof images | |
| `invoices` | Invoice PDFs | |
| `print-files` | Print-ready files | Staff only |

## Run it locally

```bash
npm install
cp .env.example .env.local   # fill in the values (names only are committed)
npm run db:migrate           # applies supabase/migrations/*.sql
npm run db:seed              # catalogue, templates and test accounts
npm run dev                  # http://localhost:3000
```

Checks:

```bash
npm test
npm run typecheck
npm run lint
npm run rls:check
npm run build
```

Environment variables are listed, without values, in `.env.example`. Secrets live only in `.env.local` (git-ignored) and in Vercel's project settings.

## More docs

- `docs/DECISIONS.md`: every point the PRD left open, and the choice made.
- `docs/LEARN.md`: how each part works, in plain words, with likely interview questions.
- `docs/PRD.pdf`: the original brief.
