# PRD check: Digital Heroes PRD (Level 2) against the built product

Checked 2026-11-17 against `docs/PRD.pdf` (identical to the PDF HR sent).
Live site: https://digital-heroes-print.vercel.app

Labels: **VERIFIED** means a test or check was run today and passed. **ASSUMED** means the code does it but no test exercised it today. **NOT CHECKED** means nobody looked.

## Test runs today

| Check | Result |
|---|---|
| Unit tests (`npx vitest run`: pricing, tiers, VAT, fitting, print-area lock, pipeline, CSV merge, print engine, Xero, storage paths) | 36/36 pass |
| Browser tests, phone 375 / tablet 768 / desktop 1280 (`npm run e2e`) | 29 pass, 10 skipped (desktop-only tests on phone/tablet, plus the paid flow below) |
| Paid flow with Stripe test card, desktop (`npm run e2e:pay`) | Full order, designer drag, sign-up: all pass (see below) |
| Staff production output (`e2e/production.spec.ts`) | 2/2 pass |
| Database security (`npm run rls:check`) | All checks pass |
| Type check, lint (`tsc --noEmit`, `eslint .`) | Clean, 0 warnings |
| Production build (`npm run build`) | Succeeds |
| Dependency audit (`npm audit --omit=dev`) | 0 vulnerabilities |
| Design lint (`sloplint --kept`) | 0 FAIL; all 54 links, 31 fields, 86 handlers kept |
| Live smoke (curl) | All public pages 200, account/admin redirect to sign-in, 404 page, HTTPS enforced |

The paid run placed real test orders (to the demo customer account); the last full one was **DH-001026**: paid, changes asked on v1, v2 sent, v2 approved, files made, moved to production, reorder reached Stripe.

## Section 16: the PRD testing checklist

| Item | Verdict | Evidence |
|---|---|---|
| Signup & login | **VERIFIED** | `order-flow.spec` creates a new customer through /signup, checks the profile (role customer, name, company), then deletes the account. Every signed-in test logs in through /login. |
| Product configuration & live pricing | **VERIFIED** | `storefront.spec` "product page price follows the quantity"; unit tests for the price formula, material multiplier, minimum, out-of-range rejection. |
| Volume-discount calculation | **VERIFIED** | Unit tests "picks the highest tier reached and none below the first", "tells the customer the next saving". Live order shows "250 × £0.178 (15% volume discount)". |
| Designer: print-area constraints | **VERIFIED** | Unit tests (slide back, scale down, rotation). Browser test: typing X −500 / Y 900 is pulled back inside; dragging far off the artboard stops at the safe-area edge (x 19.8 + w 67.2 = 87 mm = 90 mm trim − 3 mm safe margin). |
| Proof versioning & approval gate | **VERIFIED** | Paid flow: v1 change request, staff page shows "Locked until a proof is approved", v2 sent, v2 approved, files unlock. Database refuses Production without an approved proof (`rls:check`). |
| Print-file & CSV merge output | **VERIFIED** | `production.spec`: files named `DH-001003_race-bibs_<date>_Print.pdf` etc., real PDF/PNG/SVG/ZIP bytes; the CSV ZIP holds one PDF per row plus `report.csv`. Unit tests for the merge and naming. |
| Reorder flow | **VERIFIED** | Paid flow clicks "Reorder this job" and lands on Stripe checkout with fresh pricing. |
| Admin pipeline & file download | **VERIFIED** | Paid flow moves the job to In production (two-click confirm); `production.spec` downloads every print file; a customer asking for the same link gets 404. |
| Responsive on mobile & desktop | **VERIFIED** | Every browser test runs at 375, 768 and 1280 px and fails if anything sticks out sideways. |
| Error handling & edge cases | **VERIFIED** (partly) | 404 page; guests sent to sign-in; customer blocked from /admin; unsigned Stripe webhook refused (400); price tampering, cross-customer reads and storage path tricks refused (`rls:check`, storage-path tests); CSV rows that do not fit are flagged (unit test). Payment declines and upload errors were **NOT CHECKED** today. |

## Sections 01–15

### 02 Core objectives and 05 Pricing & checkout
| Requirement | Verdict | Evidence |
|---|---|---|
| Instant per-unit price by product, size, quantity | VERIFIED | storefront test, unit tests |
| Volume discounts from a quantity floor | VERIFIED | tiers per product in the database (labels: 100+ 10% … 5,000+ 40%) |
| VAT-inclusive totals, final price at checkout | VERIFIED | "Total with VAT" on the product page; server reprices at checkout (DECISIONS.md) |
| Stripe checkout | VERIFIED | paid flow, test card 4242 |
| Order written against the customer account | VERIFIED | order shows in the customer account and on the staff job board |
| Xero-ready data | VERIFIED | `production.spec` downloads the Xero sales-invoice CSV (`*ContactName` header, DH- numbers) |
| No subscription model | VERIFIED | per-order checkout only |

### 03 User roles
| Requirement | Verdict | Evidence |
|---|---|---|
| Visitor: ranges, gallery, price calculator, signup | VERIFIED | storefront tests, signup test |
| Customer: profile, design and order, approve or request changes, history, reorder, saved designs | VERIFIED | accounts and paid-flow tests |
| Admin: users and orders, pipeline, file download, products & templates, reports | VERIFIED for pipeline, downloads, reports pages, Xero; **ASSUMED** for changing roles and editing products/templates (pages load in tests; the save buttons were not clicked today) |
| Roles kept apart | VERIFIED | customer blocked from /admin; customers see no print files, email log or other customers' orders (`rls:check`) |

### 04 Catalogue & configuration
| Requirement | Verdict | Evidence |
|---|---|---|
| Six divisions | VERIFIED | home mat shows six families; all family pages 200 |
| Parameter-driven products, dynamic size/material/orientation/quantity | VERIFIED | one product row with a config schema; configurator test |
| Per-placeholder fitting (shrink-to-fit, tracking, min/max size) | VERIFIED | fitText unit tests (5) |

### 06 Designer
| Requirement | Verdict | Evidence |
|---|---|---|
| Text, fonts, sizes, colours, logos, move/resize/rotate | VERIFIED for adding text and moving; **ASSUMED** for fonts, colours, logo upload, rotate (in the inspector and canvas code, not clicked by a test today) |
| Locked to print areas | VERIFIED | see checklist above |
| Real-time proof preview, approved = printed | VERIFIED | the proof stores its own frozen design; print files are made from it (unit test, DECISIONS.md) |
| Upload path PDF, SVG, AI, PNG | **ASSUMED** | the upload picker accepts all four and file headers are checked; no upload was run end to end today |
| Saved designs | VERIFIED | "Saved designs" section on the account page (accounts test) |

### 07 Print-file & variable data, 08 Proofs
All **VERIFIED**: see the checklist rows for print files, CSV merge, versioning, approval log ("approved by …" checked in the paid flow), change requests and the gate. Bleed and dpi are set per product (DECISIONS.md). Generation runs on the server.

### 09 Accounts & reorder, 10 Customer dashboard
| Module | Verdict |
|---|---|
| Secure login and registration | VERIFIED |
| Order history with status and files | VERIFIED (progress list "stage n of 6") |
| Active proofs and version state | VERIFIED ("Proofs to review" leads the account page) |
| Saved designs | VERIFIED |
| One-click reorder | VERIFIED |
| Downloadable invoices | VERIFIED (accounts test downloads the invoice and checks it is a PDF) |
| Profile status | VERIFIED ("Your details") |
| Customer never sees production files | VERIFIED (404 test, `rls:check`) |

### 11 Production dashboard
| Capability | Verdict |
|---|---|
| Search and filter by status, customer, date, product type | VERIFIED for status, product type and order-number search (tests); **ASSUMED** for the customer-name and date filters (fields exist, not exercised) |
| Ready-for-production indicator | VERIFIED ("Locked until…" / "Ready for production") |
| Download PDFs and per-row CSV artwork | VERIFIED |
| Advance the pipeline, with status emails | VERIFIED (move to production; email log shows production and completed emails sent) |
| Reports: orders, revenue, family throughput | VERIFIED page loads; figures **ASSUMED** correct (not cross-checked by hand today) |
| Archive | **ASSUMED** (archive control and filter exist; not clicked today) |

### 12 UI/UX
| Requirement | Verdict |
|---|---|
| Confident accent on a neutral base, geometric headings, dense-spec body face | VERIFIED by design review (Cutting-mat redesign, critic and UX audit done before launch) |
| Equal-weight product tiles, live price calculator, gallery by family | VERIFIED (home mat test, price test, gallery 200) |
| Mobile-first, subtle motion | VERIFIED for layout at 375 px; motion respects reduced-motion settings |

### 13 Technical
| Requirement | Verdict |
|---|---|
| Next.js, React, Tailwind, Supabase, Node server code | VERIFIED |
| HTTPS enforced, secure sessions | VERIFIED (HSTS, http→https 308, Supabase sessions) |
| Email notifications | VERIFIED: 46 sent in total (order, proof, production, completed, staff alerts). 4 failed on 16 Nov between 19:18 and 19:37 UTC, before the Gmail app password was corrected. |
| Server-side file generation and CSV merge | VERIFIED |
| Fast performance | **NOT CHECKED** with Lighthouse. Live page times by curl: 0.5–1.4 s, home 3.3 s on a cold start. |

### 14 Scalability
| Requirement | Verdict |
|---|---|
| New divisions and templates without rework | VERIFIED by design: divisions, products and templates are database rows |
| Corporate / multi-account | VERIFIED by design: `organizations` table, `profiles.organization_id` (no screens yet) |
| Future mobile app | ASSUMED: pricing, layout, pipeline and print code are plain TypeScript in `src/lib`, and the database enforces access itself (RLS) |
| Xero API path | VERIFIED by design: `AccountingAdapter` interface, CSV adapter live |

### 15 Deliverables
| Item | Verdict |
|---|---|
| Live public URL | VERIFIED |
| Customer and admin credentials | VERIFIED (README, seed file) |
| Documented schema | VERIFIED (`supabase/migrations`, README) |
| New Vercel and Supabase accounts | VERIFIED (separate Vercel scope and Supabase project) |
| Env vars set, never committed | VERIFIED (all 14 set in Vercel production; `.env.local` git-ignored) |
| Clean, commented code | VERIFIED by lint, type check and reviews |

## Found and fixed today
1. **Customer could hit a dead end right after paying.** Proof v1 showed "Waiting for you" with no buttons for the second or so before the job moved to Proof sent. The page now says the proof is still being sent and offers a refresh. (`src/app/account/orders/[id]/page.tsx`). Fixed locally; **not yet deployed**.
2. ESLint was reading the installed design-skill scripts in `.claude/`; they are now ignored, and app code lints with 0 warnings.
3. Browser tests extended to cover the full PRD checklist (change request, v2, gate, production, reorder, sign-up, designer drag, invoice).

## Gaps, stated plainly
- Nobody signed in or ordered on the **live** site today (by rule, test logins run on localhost only). The live site uses the same code and settings.
- Lighthouse was not run.
- Uploads of PDF/SVG/AI/PNG, the archive, role changes, product edits and the customer-name and date filters exist in code but were not clicked by a test today.
- Known limits from `docs/DECISIONS.md` still apply (1,000-row report reads, no rate limit on sign-in, CSV merge without a job queue).
