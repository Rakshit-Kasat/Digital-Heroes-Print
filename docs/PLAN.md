# Plan: Digital Heroes "Level 2" web-to-print platform (Tier 3)

## Context
Digital Heroes HR set a 2-day selection task: build and deploy a working web-to-print platform from their PRD (11 pages, read in full). A print house with six divisions (labels & stickers, race & event numbers, MTB boards, stamps, trophies, laser-cut). Customers configure → get a live price → design in-browser (or upload) → approve a versioned proof → pay → reorder. Admins run a 6-stage pipeline (Quote → Order → Artwork → Proof → Production → Completed), download server-made print files (PDF/PNG, CSV merge for race numbers), see reports.
Hard rules from the PRD: new Vercel + new Supabase accounts, env vars never committed, live URL, test + admin credentials, documented schema, clean commented code. Scored on: requirement accuracy, system design, UI/UX originality, pricing/file/order accuracy, scalability, and how ambiguity is resolved (so DECISIONS.md matters).
Rakshit also wants the code optimised and wants to be taught every part of it.

**Online search result (VERIFIED):** two earlier submissions exist for this exact PRD — [dharmendradev-0107/dh-prd-2](https://github.com/dharmendradev-0107/dh-prd-2) and [Dharmendra0107/Digital-heroes-prd-2](https://github.com/Dharmendra0107/Digital-heroes-prd-2) (Next.js 16, Supabase, Stripe, Fabric.js, PDFKit, Sharp). We will **not copy them** (HR can find them too; copying fails the "understanding" part). We learn from their weak spots: they only rasterise single-page PDFs, cap CSV at 100 rows, and their print files depend on a client-side canvas. Our edge: **one shared layout engine** used by both the browser preview and the server renderer, so "what is approved is what is printed" is literally true.

**Answers locked:** project at `D:\digital-heroes-w2p` · GBP with 20% VAT (rate is a setting) · Stripe test mode · critic (Opus) + security-auditor (Haiku) sub-agents at the end.

## Usage and time (ASSUMED estimates)
- **Weekly all-models limit is at 99% now; it resets in ~2h 13m.** 5-hour window at 10%. Build must start after the weekly reset, or it will stall early.
- Whole build: ~3–4 five-hour windows over 2 days, ~15–25% of the new week, 2 sub-agents (+15–25% of one window).
- Model: Opus for this plan; **switch to Sonnet for the build** (model menu), Opus again only for the critic step.
- Checkpoint after every phase into `STATUS.md` + `HANDOVER.md` so a limit stall resumes cleanly.

## Stack (all free tiers)
| Layer | Choice | Why |
|---|---|---|
| App | Next.js 16 App Router, TypeScript, Tailwind v4 | PRD reference stack; server components keep JS small |
| DB/Auth/Files | Supabase (Postgres, Auth, Storage, RLS) via `@supabase/ssr` | PRD stack; RLS enforces the role split |
| Designer | Fabric.js v6, loaded with `next/dynamic` only on the design page | Mature canvas lib; keeps it off every other page |
| Layout engine | Our own `lib/layout/` (pure TS) + `fontkit` for text measuring | Same fitting maths on client and server |
| Print files | `pdf-lib` (+ `@pdf-lib/fontkit`) for PDF, `@resvg/resvg-js` for 300-dpi PNG | Pure JS/WASM, runs on Vercel serverless |
| CSV merge | `papaparse` + `fflate` (zip) | Small, fast |
| Payments | Stripe Checkout (test) + webhook | PRD names it |
| Email | `nodemailer` over Gmail SMTP (app password) + `email_log` table | Delivers to any address (Resend sandbox can't); log shows every send |
| Tests | Vitest (unit) + Playwright (e2e smoke) | |

## Data model (Supabase, all tables with RLS) — `supabase/migrations/0001_init.sql`
- `profiles` (id → auth.users, full_name, company, role `customer|admin`, organization_id nullable → future corporate accounts)
- `organizations` (stub for multi-account ordering — scalability item)
- `divisions` (slug, name, sort, hero image) — new division = new row, no code
- `products` (division_id, name, `config_schema` jsonb: size min/max mm, orientations, materials[{id, name, multiplier}], qty min/max; `pricing` jsonb: rate per cm², setup fee, min unit price, volume tiers; bleed_mm, dpi, active)
- `templates` (product_id, name, `design` jsonb: canvas size, print areas, placeholders with fit rules `{shrinkToFit, minPt, maxPt, tracking}`)
- `designs` (owner_id, product_id, template_id, `doc` jsonb, thumbnail_path, saved flag) — saved designs for reuse
- `orders` (customer_id, number `DH-000123`, status enum quote|order|artwork|proof|production|completed, subtotal/vat/total pence, currency, stripe ids, archived_at)
- `order_items` (order_id, product_id, config jsonb, qty, unit_price_pence, design_id, upload_path, csv_path)
- `proofs` (order_item_id, version int, file paths, status pending|approved|changes_requested, unique(order_item_id, version))
- `proof_events` (proof_id, actor_id, action approved|changes_requested, note, created_at) — approval log
- `order_events` (order_id, from, to, actor_id, at) — pipeline history
- `print_files` (order_item_id, kind pdf|png|zip, path, created_at) — admin-only
- `invoices` (order_id, number, pdf_path, issued_at)
- `email_log` (to, template, order_id, status, error)
- Helper `is_admin()` security-definer function used in policies. Customers: own rows only. Admin: all. `print-files` storage bucket: admin-only, no customer policy at all.
- SQL views for reports: revenue by month, orders by status, throughput by division.
- `supabase/seed.sql`: 6 divisions, ~8 products, 1–2 templates each, demo customer + admin (credentials live in the seed file and README, never in chat).

## Core logic (pure functions, unit-tested)
- `lib/pricing/calculate.ts` — area × rate × material multiplier, setup fee, volume tiers (e.g. 100+ = 10%, 250+ = 15%, 500+ = 20%, 1000+ = 25%, per product), VAT 20%, integer pence (no float errors). **Server recomputes the price at checkout; client price is display only.**
- `lib/layout/fitText.ts` — shrink-to-fit between min/max pt, then tracking, then flag "doesn't fit"; used by designer, proof render and CSV merge.
- `lib/layout/constrain.ts` — clamp object bounds/rotation inside the print area (used by Fabric `object:moving/scaling/rotating`).
- `lib/orders/pipeline.ts` — allowed status transitions + guard: "production" only if latest proof approved.
- `lib/print/render.ts` — design JSON → SVG (shared) → PNG (resvg) and PDF (pdf-lib) with bleed + crop marks; file names `OrderID_ProductType_Date_Output`, stored under `orders/{orderNumber}/`.
- `lib/print/csvMerge.ts` — one artwork per CSV row (race numbers), streaming into a zip, row-level error report.
- `lib/accounting/xero.ts` — Xero sales-invoice CSV export now; adapter interface so the real Xero API can be switched on later.

## Pages
Public: `/` (hero + equal-weight division tile hub + live calculator + gallery), `/products/[division]`, `/products/[division]/[product]` (configurator + live price), `/gallery` (by division), `/login`, `/signup`.
Customer (`/account/...`): dashboard (profile status, active proofs + version, order history + status, saved designs, one-click reorder, invoice download), `/design/[designId]` designer, `/upload` path (PDF/SVG/PNG/AI; AI stored, flagged for manual check), proof review page (approve / request changes), checkout success.
Admin (`/admin/...`): job board (search/filter by status, customer, date, product type; "files ready" badge), order detail (advance stage, upload/regen proof, generate + download print files, CSV merge), users (role change, last-admin guard), products/templates editor, reports, archive, Xero export.
`middleware.ts` refreshes the session and blocks `/admin` for non-admins (RLS is the real guard).

## Build order (each phase ends with a checkpoint + a short teaching note)
0. **Setup** — you create new GitHub, Vercel, Supabase, Stripe, Gmail-app-password (I give steps 5 at a time). I scaffold in `D:\digital-heroes-w2p`, git init, `.env.example` (names only), `.gitignore`, `/scaffold` files. *Done when:* `npm run dev` shows the app and connects to Supabase.
1. **Schema + RLS + seed** — migration, policies, seed. *Done when:* Supabase advisors show no RLS warnings; a customer can't read another customer's order (tested with two users).
2. **Design directions (gate)** — `/design-options`: 2–3 "boutique industrial" directions (muted base, one confident accent, geometric heading font, dense-spec body font — no default AI fonts), as one artifact. You pick one.
3. **Storefront + pricing** — tile hub, division/product pages, configurator, live calculator, gallery. *Done when:* pricing unit tests pass incl. volume tiers and VAT; price updates on every change.
4. **Auth + designer + upload** — signup/login, Fabric designer with print-area lock, fonts, colours, logo upload, rotate/resize, live proof preview, save design. *Done when:* objects can't be dragged or scaled outside the print area; text auto-shrinks.
5. **Cart → checkout → order** — Stripe Checkout, webhook writes order + items + invoice PDF + email. *Done when:* test card pays and the order shows in both dashboards.
6. **Proofs + print engine + CSV merge** — v1/v2 proofs, approve/change request, approval log, gate, server PDF/PNG, CSV zip. *Done when:* print files can't be generated before approval; a 50-row CSV gives 50 named files.
7. **Dashboards** — customer modules, admin pipeline, reports, archive, users, Xero export, reorder. *Done when:* reorder makes a new order from saved artwork with fresh pricing.
8. **Polish + quality** — mobile pass at 375px, micro-interactions (CSS transitions, no heavy animation lib), error/empty states, images (real licensed photos from Unsplash/Pexels for the gallery; I list any division I can't match instead of using placeholders), Lighthouse. Then critic + security-auditor sub-agents, fixes, `/gauntlet`.
9. **Deploy** — Vercel preview → **you check the preview (gate 2)** → production, Stripe webhook pointed at the live URL, smoke test on live.
10. **Handover + teaching** — README (setup, credentials, schema diagram), `docs/DECISIONS.md` (every ambiguity: currency, tiers, bleed 3 mm, 300/600 dpi, AI files, file naming, etc.), `docs/LEARN.md` (each module explained in plain words: what it does, why, where the code is, how to talk about it in the interview), `/handover`, `/retro`, usage log line.

## Teaching approach
- Every file starts with a short "why this exists" comment; tricky lines get one-line comments.
- After each phase I explain that phase in chat (short), and `docs/LEARN.md` grows with it.
- At the end: a walk-through of one full order's life (click → DB rows → files), plus likely interview questions with answers.

## Verification
- `npm run test` — Vitest: pricing, volume tiers, VAT rounding, fitText, constrain, pipeline transitions, CSV merge (good + bad rows).
- `npm run build` + `npm run lint` clean, no skipped tests or disabled rules.
- Playwright e2e on local then preview: signup → configure → design → checkout (4242 card) → admin uploads proof → customer approves → admin generates files → download → reorder.
- RLS check with two customer accounts + admin; storage bucket access check for print files.
- Built-in browser screenshots at 375px and desktop for every main page.
- PRD testing checklist (section 16) ticked item by item in HANDOVER.md, each VERIFIED / ASSUMED / NOT CHECKED.

## Toolkit suggestions (need your OK, nothing installed yet)
- Supabase + Vercel connectors (already connected) — but they're tied to your existing accounts; for the **new** accounts we use the CLIs/dashboards instead, so nothing touches your personal projects.
- Playwright MCP (installed) for e2e + screenshots. gitleaks (installed) before every push.
