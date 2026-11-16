# STATUS — Digital Heroes web-to-print (Tier 3)

Deadline: 2 days from 2026-11-16 (submit by 2026-11-18). Plan: `docs/PLAN.md`. PRD: `docs/PRD.pdf` (text copy `docs/PRD.txt`).

Locked choices: GBP + 20% VAT (setting) · Stripe test mode · Gmail SMTP for email · critic (Opus) + security-auditor (Haiku) approved for phase 8 · folder `D:\Digital Heroes`.

## Progress
- [x] Plan approved (2026-11-16)
- [x] Folder set up, plan + PRD copied into docs/
- [ ] Phase 0 — accounts (Rakshit): new Gmail, Vercel, Supabase, Stripe, Gmail app password
- [ ] Phase 0 — scaffold Next.js 16 + git + .env.example
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

## Next step
Rakshit finishes the 5 account steps. Then a fresh session (Sonnet) runs Phase 0 scaffold.
Keys go straight into `.env.local` (never pasted in chat, never committed).
