# Handover: Digital Heroes Print (web-to-print platform)

Date: 2026-11-17 · Updated after the PRD check (docs/PRD-CHECK.md) and the proof-gap fix went live · No git remote yet

Labels used below: **VERIFIED** means it was run or seen. **ASSUMED** means it was reasoned from the code or the docs but not run. **NOT CHECKED** means it was not looked at.

---

## 0. Redesign (2026-11-17, live)

Rakshit picked direction B, "Cutting mat", from three options. Products sit on a green cutting mat with a 10 mm grid, drawn at true relative scale.

- **Scope:** home, product families, product configurator, designer, customer area and staff console.
- **Checks, VERIFIED:**
  - Hallmark lint: 0 FAIL (was 9). All 54 links, 31 fields and 86 handlers kept.
  - Unit tests: 36/36.
  - tsc, eslint and the production build pass.
  - Playwright suite (`npm run e2e`): 27 pass at 375, 768 and 1280 px.
  - Paid order flow (`npm run e2e:pay`): passes on localhost with the Stripe test card.
- **Reviews:** critic (Opus) and ux-auditor (Sonnet) ran. Their findings are fixed or answered (see STATUS.md).
- **Approval:** Rakshit approved the preview, then it went to production.
- **Before and after:** screenshots in `docs/redesign/before` and `docs/redesign/after`; the audit is in `docs/redesign/AUDIT.md`.
- **Demo data:** test runs added paid orders (up to DH-001026) and unpaid quotes to `customer@dhprint.test`; the sign-up test deletes its own account.
- **PRD check (2026-11-17):** every PRD section and testing-checklist item mapped to evidence in `docs/PRD-CHECK.md`. Suite now: unit 36/36, e2e 29 pass at three widths, paid flow 5/5 (change request, v2, gate, production, reorder, sign-up, designer drag), production output 2/2, RLS, build, lint 0 warnings, audit 0. One fix shipped: the customer order page explains the second between payment and Proof sent.

## 1. What was built

| | |
|---|---|
| **Production** | https://digital-heroes-print.vercel.app (Vercel team `digital-heroes-print`, Hobby plan) |
| **Preview** | Every `vercel deploy --target preview` gets its own URL. No preview is kept separately; the first deploy went straight to production (the CLI's default for a new project). |
| **Database / files / auth** | Supabase project `digital-heroes` (Mumbai, ap-south-1), 6 migrations (`supabase/migrations/0001` … `0006`) |
| **Payments** | Stripe sandbox (test mode, GBP). Webhook `we_1UcW2ORz60Mh3UU0vClwpkcE` points at `/api/stripe/webhook`. |
| **Email** | Gmail SMTP (App Password) from g2hklic@gmail.com; every send is logged in `email_log` |
| **Docs** | `README.md` (setup, test accounts, schema) · `docs/DECISIONS.md` (every open point in the PRD) · `docs/LEARN.md` (how it works, plus interview Q&A) · `docs/PLAN.md` · `docs/PRD.pdf` |

What a customer can do:
- browse six product families;
- configure size, material and quantity with a live price (volume tiers, setup fee, 20% VAT);
- design in the browser (text fitting, print-area lock, undo, autosave) or upload PDF/SVG/PNG/JPG/AI;
- add a CSV of names and numbers for race bibs, MTB boards and trophy plates;
- pay by Stripe;
- approve proofs or ask for changes;
- download invoices;
- reorder in one click.

What staff can do:
- use the job board (filters, archive, "files ready" badge);
- open a job to move stages, send proof versions, and generate and download print files (PDF with bleed and crop marks, PNG at 300/600 dpi, SVG, a ZIP per CSV);
- manage users and roles;
- edit products and prices;
- see reports;
- export a Xero CSV.

## 2. Gauntlet results

A formal `/gauntlet` run was **not** done. The table below lists every check that actually ran, with its latest result.

| Check | Result | Notes |
|---|---|---|
| Unit tests (`npm test`) | **PASS**, 36/36 | Pricing, tiers, VAT, text fitting, constraints, pipeline, CSV, rendering, storage paths |
| TypeScript (`tsc --noEmit`) | **PASS** | |
| ESLint | **PASS** | No disabled rules |
| Production build | **PASS** | All routes partially prerendered |
| Privacy test (`npm run rls:check`) | **PASS**, 19/19 | Two real customers plus admin, using the public key. Covers path tricks, the email lock and the production gate. |
| Security audit (agent) | **PASS after fixes** | 2 critical, 2 high, 5 medium and 8 low findings. Both criticals, both highs and 7 others are fixed. The rest are in Known issues. |
| Code critique (critic agent) | **PASS after fixes** | 15 findings: 10 fixed, 5 listed as known limits in DECISIONS.md |
| UX / accessibility audit (agent + web-design-guidelines) | **PASS after fixes** | 25 findings. The main ones are fixed: focus rings, 44 px targets, contrast, mobile header, error and 404 pages. |
| Secret scan (gitleaks) | **PASS, with one finding accepted** | The only hit is the demo passwords in `scripts/seed.ts`. They are there on purpose because the brief asks for test credentials. |
| `npm audit` (production deps) | **PASS**, 0 vulnerabilities | Run by the security agent |
| Live smoke test (curl) | **PASS** | Public pages 200; `/admin`, `/account` and `/files` redirect to login; unknown URL 404; unsigned or forged webhook refused; CSP and HSTS headers present |
| Mobile at 375 px (live) | **PASS** on home and product page | No horizontal scroll. The designer and admin were not checked on a phone. |
| Lighthouse / Core Web Vitals | **NOT RUN** | |
| SEO audit | **NOT RUN** | |
| Accepted by Rakshit | **Pending** | Rakshit has not reviewed the live site yet. Preview-before-publish was broken once (the first deploy went to production). |

## 3. VERIFIED vs ASSUMED vs NOT CHECKED

**VERIFIED**
- **Full order on localhost** as `g2hklic+customer@gmail.com`: design, then Stripe test payment, then DH-001005 paid. That order then got:
  - invoice INV-001005;
  - proof v1, approved;
  - print files (PDF, 300 dpi PNG, SVG);
  - admin moves to production and completed;
  - 6 emails sent.
- **After the security fixes:**
  - Reordering DH-001005 created DH-001008. The **live** webhook claimed and processed it (invoice, proof v1, 3 emails).
  - The customer asked for changes.
  - The admin sent proof v2 through the new proof guard.
- **Payment amount check:** the Stripe totals of both real paid test orders match the stored totals. The new check would not have rejected them.
- **Database guards (in rls-check):**
  - designs cannot point at other buckets, at `..`, at `%2e%2e`, or at another customer's folder;
  - a customer cannot change the email orders are sent to;
  - Production is refused without an approved proof;
  - an order with an approved proof is still allowed into Production (tested in a rolled-back transaction).
- **Gmail SMTP login works;** the emails above were logged as `sent`.
- **Environment variables:** set on Vercel; `.env.local` is git-ignored and was never committed.

**ASSUMED**
- Emails actually land in the inbox and not in spam. The log says `sent`; the inbox was not opened.
- The live site behaves like localhost for sign-in, designing and staff actions. It is the same build and the same database, but Claude does not sign in on the production host.
- Stripe retries the webhook after a 500 and the retry finishes the job. This is documented Stripe behaviour; it was not forced in a test.
- Vercel's function time limit is enough for a 1,000-row CSV merge. Only small CSVs were run.

**NOT CHECKED**
- Signing in and placing an order on the **live** URL (Rakshit to do; steps below).
- The designer and admin screens on a phone.
- Lighthouse scores, SEO, screen-reader walk-through.
- Large uploads (close to 15 MB) and AI/PDF uploads through to a staff proof on live.
- A CSV with 1,000 rows end to end.
- Behaviour when the Supabase free project is paused (see risks).

**Rakshit: quick live check (5 steps)**
1. Open https://digital-heroes-print.vercel.app and sign in as `customer@dhprint.test`. The password is in README.md.
2. Products → Product labels → Design it → change the text → Pay. Use card 4242 4242 4242 4242, any future date and any CVC.
3. On the success page, check it says "Paid". Under Your account, the proof should appear within a few seconds.
4. Approve the proof. Then sign out and sign in as `admin@dhprint.test`.
5. Job board → open the order → Generate print files → download the PDF → move to Production, then Completed.

## 4. Known issues and risks, ranked

1. **Supabase free project pauses after about a week with no traffic.** If reviewers open the site after a quiet week, it will error until the project is resumed in the dashboard. Keep it active, or move to the Pro plan.
2. **The Vercel Hobby plan is for non-commercial use.** A real client launch needs Vercel Pro.
3. **Demo passwords are in `README.md` and `scripts/seed.ts`,** including admin. The repo has no remote today. If it is pushed publicly, anyone could sign in as admin on the live site. Rotate the passwords after review (`npm run db:seed` with new values).
4. **No rate limit or CAPTCHA on sign-in and sign-up, and sign-up does not confirm the email.** Someone could script mass sign-ups or guess passwords. Planned fix: Cloudflare Turnstile and Supabase email confirmation.
5. **The webhook does all its work inline** (invoice PDF, proof render, emails) before replying. It is safe to repeat, but a slow SMTP server can push it close to Stripe's timeout.
6. **Reports and the Xero export read at most 1,000 rows.** Totals will be wrong past that.
7. **Order creation is two inserts, not one transaction.** A failure between them leaves a harmless empty quote.
8. **Supabase session cookies are readable by page scripts** (the library's default). No script-injection point is known, but this is defence-in-depth we don't have.
9. **Gmail SMTP sends about 500 emails a day at most,** and the sender is a personal address. A real shop needs a domain sender (Resend or Postmark with SPF/DKIM).
10. **No real product photography.** The gallery shows jobs rendered by the print engine. Photos are still needed for every family: labels, stickers, race bibs, MTB boards, stamps, trophy plates and laser-cut signs. Leftover Next.js starter icons are still in `public/`, unused.
11. **No git remote, no CI.** The code exists only on this PC and in Vercel's build cache.

## 5. Next 5 improvements (impact ÷ effort)

| # | Improvement | Impact | Effort |
|---|---|---|---|
| 1 | Push to a private GitHub repo and connect Vercel to it, with tests and lint on every push | High: backup, history, preview deploys per branch | 30 min |
| 2 | Turnstile on sign-in and sign-up, plus Supabase email confirmation | High: stops bot sign-ups and password guessing | 2–3 h |
| 3 | Domain email sender (Resend or Postmark) and a custom domain | High: deliverability and trust | 2 h, plus DNS wait |
| 4 | Webhook stores event IDs and hands work to a queue (Supabase Queues or Inngest); same queue for large CSV merges | Medium-high: reliability at volume | 1 day |
| 5 | Order creation as one database function; paged reports and Xero export | Medium: correctness at scale | half a day |

## 6. Maintenance

**Who owns what:** every account is under **g2hklic@gmail.com**.

| Service | Account / project | Plan now | Monthly cost now | For a real launch |
|---|---|---|---|---|
| Vercel | team `digital-heroes-print` (user `g2hklic-7240`) | Hobby | £0 | Pro, about $20 per user per month (Hobby is non-commercial) |
| Supabase | org "g2hklic@gmail.com's Org", project `digital-heroes` | Free | £0 | Pro, about $25 per month (no pausing, daily backups) |
| Stripe | UK account, sandbox | Pay as you go | £0 (test mode) | Per-transaction card fees only; activate live mode with business details |
| Gmail SMTP | g2hklic@gmail.com, App Password | Free | £0 | Swap for Resend or Postmark (free tier, then about $15–20 per month) |
| Domain | none (uses vercel.app) | — | — | About £10–15 per year, renews yearly |

Prices are ASSUMED from public price lists at the time of writing; check before quoting a client.

**Renewals:**
- No domain yet.
- The Gmail App Password stops working if the Google password changes or 2-Step Verification is turned off.
- Stripe test keys do not expire.

**Backups:**
- The **free Supabase plan has no automatic backups.** Until Pro, take a manual dump with `pg_dump` using the `SUPABASE_DB_PASSWORD` connection, or use the dashboard's export.
- Storage files (artwork, proofs, invoices, print files) are not backed up.
- The code lives on this PC (`D:\Digital Heroes`) and needs a git remote (improvement #1).

**Security housekeeping:**
- Turn on 2FA for the Vercel, Supabase, Stripe and Google accounts.
- Rotate the demo passwords after review.
- Secrets are only in `.env.local` and Vercel's environment settings.

**Note:** the old Vercel login on this PC (`teamsocialtrap-7165`) was left untouched. Every command for this project uses `-Q "C:/Users/raksh/.vercel-dh" --scope digital-heroes-print`.

## 7. Upsell ideas for the client

- **SEO:**
  - product-family landing pages for local searches ("race numbers printing UK", "custom MTB number boards");
  - structured product data with prices;
  - a gallery of real jobs with photos.
- **Ads:**
  - Google Shopping or Search campaigns aimed at event organisers before race season;
  - retargeting for abandoned quotes (the system already stores unpaid quotes).
- **Automation:**
  - abandoned-checkout emails after 24 hours;
  - proof reminders after 48 hours;
  - automatic reorder nudges for seasonal events (same race next year);
  - a live Xero API sync instead of the CSV export.
- **WhatsApp agent:** order status and proof-approval links over WhatsApp Business. Event organisers often prefer it to email.
- **Analytics:**
  - funnel from configure to design to pay to approve (where people drop out);
  - quote-to-order conversion per product family;
  - average proof rounds per job.
- **B2B accounts:** the `organizations` table is already in the schema, ready for clubs and companies with several buyers and one monthly invoice.
