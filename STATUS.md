# STATUS — Digital Heroes web-to-print (Tier 3)

Deadline: 2 days from 2026-11-16 (submit by 2026-11-18). Plan: `docs/PLAN.md`. PRD: `docs/PRD.pdf` (text copy `docs/PRD.txt`).

Locked choices: GBP + 20% VAT (setting) · Stripe test mode · Gmail SMTP for email · critic (Opus) + security-auditor (Haiku) approved for phase 8 · folder `D:\Digital Heroes`.

## Progress
- [x] Plan approved (2026-11-16)
- [x] Folder set up, plan + PRD copied into docs/
- [x] Phase 0 — accounts, all under g2hklic@gmail.com (VERIFIED on screen 2026-11-16):
  - Vercel: Hobby plan, team "Digital Heroes Print" (slug digital-heroes-print)
  - Stripe: country United Kingdom, Sandbox/test mode (declined the "Stripe India preview" pop-up)
  - Supabase: org "g2hklic@gmail.com's Org"; project `digital-heroes`, Mumbai (ap-south-1), automatic RLS on.
    Ignore the auto-made "g2hklic@gmail.com's Project" (Sydney) — not used.
- [x] Phase 0 — `.env.local` filled. VERIFIED live: Supabase publishable + secret keys (200), Stripe sk_test (test mode, GBP). Supabase URL trimmed of /rest/v1. NOT CHECKED: SUPABASE_DB_PASSWORD (Phase 1 migration will test it).
- [ ] Rakshit: SMTP_PASS is 8 chars — not a Gmail App Password (16 letters). Replace before email work (Phase 5). STRIPE_WEBHOOK_SECRET empty until deploy (or `stripe listen` locally).
- [x] Phase 0 — scaffold: Next.js 16.4.6, React 19.3, Tailwind 4.3, TS, ESLint, src/ dir, branch `main`, 2 commits.
  NOTE: Next 16 has breaking changes — read `node_modules/next/dist/docs/` before writing code (see AGENTS.md).
  Do NOT use the Supabase/Vercel MCP connectors in this app: they are linked to Rakshit's OLD accounts. Use CLIs (`npx supabase`, `vercel`) logged in to the new accounts.
- [x] Phase 1 — schema + RLS + seed (commit 1fa0ad0)
- [x] Phase 2 — design direction picked (boutique industrial: paper/ink + magenta accent, Red Hat Display/Text)
- [x] Phase 3 — storefront + pricing + core engine, 33 tests (c8c7647, 7374b6f)
- [x] Phase 4/5 — custom SVG designer, upload, CSV check, Stripe checkout, markPaid/fulfil (4716b8c). VERIFIED: test payment DH-001003 -> invoice + proof v1.
- [x] Phase 6 (customer side) — /account dashboard, /account/orders/[id] proof review, /files route, reorder (5b16e49). VERIFIED: approve -> 4 print files; reorder -> Stripe £36.19 (DH-001004, left unpaid).
- [x] Phase 7 — admin console (1fdff79). VERIFIED: filters, stage move proof->production (gate), print-file downloads (PDF/ZIP), Xero CSV row, last-admin DB guard, customer redirected away from /admin. `npm run build` clean (40 routes, all PPR).
  KNOWN (dev only): after an admin action that refreshes the auth cookie, Next dev throws "InvariantError ... cookies object" on re-render (makeUntrackedCookiesWithDevWarnings). Data saves fine. Re-check on the deployed build.
- [ ] Phase 8 — mobile pass, critic + security-auditor, /gauntlet
- [x] Phase 9 — deployed to https://digital-heroes-print.vercel.app (first deploy went straight to production; Rakshit told). Stripe test webhook we_1UcW2ORz60Mh3UU0vClwpkcE -> /api/stripe/webhook, secret in Vercel prod env (forged request -> 'Invalid signature', VERIFIED). NEXT_PUBLIC_APP_URL set for production. Supabase Auth URLs not needed (signup pre-confirms via admin API, no auth emails).
- [ ] Phase 10 — README, DECISIONS.md, LEARN.md, /handover, /retro
- [x] Gmail App Password set; SMTP login VERIFIED 2026-11-17, updated on Vercel.
- [x] Vercel (2026-11-17): CLI 65.16.0. The NEW account (`g2hklic-7240`) is logged in through a separate config dir, so the old global login (`teamsocialtrap-7165`) is untouched. EVERY vercel command must carry `-Q "C:/Users/raksh/.vercel-dh" --scope digital-heroes-print`. The project `digital-heroes-print` is linked (.vercel/, gitignored). 12 env vars are set for production+preview (secrets are sensitive). `src/lib/app-url.ts` falls back to the Vercel deployment URL. First deploy went to PRODUCTION (CLI default for a new project): https://digital-heroes-print.vercel.app (public pages 200; /admin, /account, /files redirect to login). Later previews: `vercel deploy` is preview only once a production deploy exists; use `--target preview` to be explicit.

## Usage log
- Deploy session 2026-11-17 (Opus, no agents): 5h 77% -> ~86%, week 14%.
- Build session 2026-11-16/17 (Opus): 5h window at 68% after phases 1-6 (customer side); week 12%.
- Planning session (Opus): 5h window 10% -> 15%, weekly reset mid-session (now 3%).
- Accounts by Claude in Chrome + scaffold (Opus, no agents): 5h 15% -> ~20%, week 3% -> ~6%, context 44% -> ~70%. Screenshots are the main cost.

## Next step (resume here)
Rakshit is away until morning and said: complete everything autonomously (UI/UX with shadcn-type skills found online, no "AI slop"; tests; docs).
DONE 2026-11-17 night: full E2E on localhost with test customer g2hklic+customer@gmail.com (in scripts/seed.ts): signup -> design -> Stripe test pay -> DH-001005 paid, INV-001005, proof v1 -> approve -> PDF/PNG/SVG print files -> admin production -> completed; 6 emails sent; Stripe event pending_webhooks 0 (live webhook delivered). Claude may not enter credentials on the production host, so the live site is checked via curl + webhook only.
Findings for the UX pass: approve checkbox has accessible name "on" (label not associated); unit price shows £0.18 for 250 x = £44.41 (rounding display); dates mix UTC (file names) and local time (UI) -> use Europe/London.
1. Find + /safe-check UI skills (shadcn, Vercel web-design-guidelines etc.), install at project scope one at a time.
2. ux-auditor agent + design-critique/accessibility skills at desktop + 375px; fix in own components (shadcn primitives only where they help).
3. critic (Opus) + security-auditor (Haiku) agents (approved). Include: customer GET /files/print/<id> must 404; customer cannot call admin actions; RLS check script. Fix, then `vercel deploy --prod -Q "C:/Users/raksh/.vercel-dh" --scope digital-heroes-print`.
4. Phase 10: README (credentials from scripts/seed.ts, schema), docs/DECISIONS.md, docs/LEARN.md, /handover, /retro.

## Older notes
Phase 1 (schema + RLS + seed) once `.env.local` is filled. Start a fresh session (Sonnet) with:

> Read STATUS.md, docs/PLAN.md and AGENTS.md in D:\Digital Heroes. `.env.local` is filled. Start Phase 1 (schema + RLS + seed), then continue phase by phase, teaching me as you go. Ask before using sub-agents.

Keys go straight into `.env.local` (never pasted in chat, never committed).
