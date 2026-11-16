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
Rakshit is away until morning: complete everything autonomously. UX audit fixes DONE (uncommitted at time of writing: globals.css focus/44px/border, header mobile, error.tsx (uses `retry` prop in Next 16), not-found.tsx, footer contact, home CTA + copy, print-sheet attr escaping, quick-quote aria-live, configurator aria-describedby, auth email attrs). README rewritten (credentials from seed). tsc/eslint/33 tests pass.
Critic findings TO FIX (service.ts etc.):
 1. Fulfilment lost if success page claims paid_at then fulfil throws: webhook gets markPaid=false and 200s. Fix: webhook returns 500 (Stripe retries) or runs fulfil when paid but no invoice.
 2. Server trusts client csvRows: parse CSV server-side in createOrderFromDesign; reject csvPath if !supports_csv.
 3. regenerateProof/uploadProof allowed at any stage: allow only order/artwork/proof with paid_at.
 4. Old print_files stay "ready" after a new proof: delete print_files in storeProof.
 5. requestChanges writes proof before checking order is in proof.
 6. report_division_throughput counts unpaid quotes (left join): new migration with filter.
 11. Order page unit = line_total/qty includes setup: subtract setup (use snapshot/itemsPence).
 13. markPaid: check amount_total/currency vs order.
 14. reorder: require source paid.
 15. schema.ts:31 image path prefix check: reject "..".
 Document as known limits (DECISIONS/HANDOVER): 7 reports/Xero no paging >1000 rows; 8 proof version race; 9 order create not atomic (RPC later); 10 CSV merge in after() no queue; 12 unit_price_pence int.
Then: security-auditor findings (agent running), commit, `npm run build`, `vercel deploy --prod -Q "C:/Users/raksh/.vercel-dh" --scope digital-heroes-print`, curl-check live, docs/DECISIONS.md, docs/LEARN.md, /handover, usage log.

## Older notes
Phase 1 (schema + RLS + seed) once `.env.local` is filled. Start a fresh session (Sonnet) with:

> Read STATUS.md, docs/PLAN.md and AGENTS.md in D:\Digital Heroes. `.env.local` is filled. Start Phase 1 (schema + RLS + seed), then continue phase by phase, teaching me as you go. Ask before using sub-agents.

Keys go straight into `.env.local` (never pasted in chat, never committed).
