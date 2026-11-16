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
- [ ] Phase 1 — schema + RLS + seed
- [ ] Phase 2 — design directions (gate: Rakshit picks)
- [ ] Phase 3 — storefront + pricing
- [ ] Phase 4 — auth + designer + upload
- [ ] Phase 5 — cart, Stripe checkout, order, invoice, email
- [ ] Phase 6 — proofs, print engine, CSV merge
- [ ] Phase 7 — dashboards, reports, archive, Xero export, reorder
- [ ] Phase 8 — polish, critic + security-auditor, /gauntlet
- [ ] Phase 9 — deploy (gate: Rakshit checks preview)
- [ ] Phase 10 — README, DECISIONS.md, LEARN.md, /handover, /retro

## Usage log
- Planning session (Opus): 5h window 10% -> 15%, weekly reset mid-session (now 3%).
- Accounts by Claude in Chrome + scaffold (Opus, no agents): 5h 15% -> ~20%, week 3% -> ~6%, context 44% -> ~70%. Screenshots are the main cost.

## Next step
Phase 1 (schema + RLS + seed) once `.env.local` is filled. Start a fresh session (Sonnet) with:

> Read STATUS.md, docs/PLAN.md and AGENTS.md in D:\Digital Heroes. `.env.local` is filled. Start Phase 1 (schema + RLS + seed), then continue phase by phase, teaching me as you go. Ask before using sub-agents.

Keys go straight into `.env.local` (never pasted in chat, never committed).
