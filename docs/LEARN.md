# Learn the codebase

This is a guide to how Digital Heroes Print works, written so you can explain any part of it in an interview. Read it top to bottom once, then use the interview questions at the end to test yourself.

---

## 1. The big picture in one paragraph

A customer picks a product, sets size, material and quantity, and sees the price change as they type. They design the artwork in the browser (or upload a file) and pay with Stripe. Paying creates an invoice and a first proof. The customer approves the proof or asks for changes. Once a proof is approved, staff generate print-ready files (PDF, PNG, SVG, or a ZIP for race numbers) from **exactly** the approved artwork, then move the job through production to completed. Everything is stored in Supabase (Postgres + file storage), and Row Level Security makes sure each customer only ever sees their own data.

## 2. The stack, and why each piece

| Piece | What it does here | Why this one |
|---|---|---|
| **Next.js 16** (App Router) | Pages, server code and API routes in one project | The PRD's stack. Server Components keep most code off the phone. |
| **React 19 + TypeScript** | UI and type safety | Types catch mistakes (a price in pounds vs pence) before they ship. |
| **Tailwind CSS 4** | Styling | Design tokens in one file (`globals.css`), no CSS-in-JS runtime. |
| **Supabase** | Postgres database, login, file storage | One service for data, auth and files, with Row Level Security. |
| **Stripe Checkout** | Card payments | Stripe hosts the card form, so card numbers never touch our server. |
| **pdf-lib, resvg, fflate, papaparse** | Make PDFs, PNGs, ZIPs; read CSVs | Pure JavaScript / WebAssembly, so they run on Vercel's serverless functions. |
| **nodemailer + Gmail SMTP** | Emails | Free and sends to any address. |
| **Vercel** | Hosting | Built for Next.js; every deploy gets its own URL. |
| **Vitest** | Unit tests | Fast, works with TypeScript directly. |

## 3. Folder map

```
src/
  app/                     pages and server actions (one folder per URL)
    page.tsx               home: hero, product families, quick quote, how it works
    products/              catalogue, product page + configurator
    design/[id]/           the designer (editor, canvas, inspector, upload, CSV)
    checkout/success/      page Stripe sends the customer back to
    account/               customer dashboard and order/proof pages
    admin/                 staff console: job board, job page, users, products, reports
    api/stripe/webhook/    Stripe tells us about payments here
    files/[kind]/[id]/     the only way to download a file (checks permission, then a 60-second link)
  lib/
    pricing/calculate.ts   the price formula (pure function, unit tested)
    layout/                fitText (shrink text to fit) and constrain (keep objects in the print area)
    design/                design document types, validation, SVG drawing, templates
    print/                 render.ts (PDF/PNG/SVG), csv.ts, csvMerge.server.ts
    orders/                pipeline.ts (stage rules), service.ts (everything that changes an order), checkout.ts
    storage.ts             read/write/sign files; storage-path.ts (the safe-path rule)
    email.ts, invoice.ts   emails and invoice PDFs
    supabase/              database clients (browser, server, admin)
  proxy.ts                 runs before each request: refreshes login, bounces signed-out users
supabase/migrations/       the database schema, in order (0001 … 0005)
scripts/                   db.ts (apply migrations), seed.ts (sample data), rls-check.ts (privacy test)
tests/                     unit tests
```

## 4. Each part, in plain words

### 4.1 Pricing — `src/lib/pricing/calculate.ts`

One pure function, `calculatePrice()`. It takes the product's rules and the customer's choices and returns every number on the quote.

1. Area in cm² = width × height.
2. Unit price = the bigger of (minimum, base + area × rate), times the material multiplier (vinyl costs more than paper).
3. Find the best volume tier the quantity reaches (for example 250+ = 15% off).
4. Items = unit × quantity × (1 − discount), **rounded once, to whole pence**.
5. Add the setup fee, then VAT at 20%.

**Why whole pence?** Computers store 0.1 + 0.2 as 0.30000000000000004. Money in integers never drifts.

**Who decides the real price?** The browser shows the price as you type, but at checkout the **server** recalculates it from the database (`createOrderFromDesign`). Someone editing the page cannot pay less.

### 4.2 The design document — `src/lib/design/`

A design is plain JSON: a list of elements (text, image, rectangle, ellipse), each with a position and size in **millimetres**. Templates store positions as fractions (0–1) so one template fits any size.

- `schema.ts` checks every document the browser sends (types, number ranges, colours, and that images come from the customer's own upload folder).
- `svg.ts` draws a document as SVG. **The browser preview, the proof and the print file all use this same drawing code.** That is why "what you approve is what prints" is true by construction, not by hope.

### 4.3 Layout rules — `src/lib/layout/`

- `constrain.ts`: when you drag, resize or rotate, the object is clamped so its rotated outline stays inside the print area. You cannot drag a logo off the edge.
- `fitText.ts`: if text is too long, it shrinks between the template's minimum and maximum size, then tightens the letter spacing, and only then shows a warning. The CSV merge uses the same function for every row, which is how we can tell a race organiser "row 37's name is too long" before they pay.

### 4.4 The designer — `src/app/design/[id]/`

- `editor.tsx` holds the state (document, selection, undo/redo history, autosave).
- `canvas.tsx` draws the SVG and handles drag, resize, rotate, with snapping and keyboard nudging.
- `inspector.tsx` edits the selected object (text, font, colour, size).
- `upload-panel.tsx` uploads finished artwork; `csv-panel.tsx` checks a names-and-numbers list.
- `actions.ts` are **Server Actions**: functions the browser calls that run on the server. They re-check who you are and load the design through RLS before saving.

Uploads go **straight from the browser to Supabase Storage** (so a 15 MB file doesn't pass through our server), into the customer's own folder. Then `attachUpload` checks the file's first bytes (a PNG really starts with the PNG signature) and links it to the design.

### 4.5 Orders and the pipeline — `src/lib/orders/`

Six stages: **Quote → Order → Artwork → Proof → Production → Completed**.

- `pipeline.ts` holds the rules (which moves are allowed, and "Production needs an approved proof"). It is a pure function, unit tested.
- The database also refuses Production without an approved proof (a trigger), so even a bug in the app cannot skip the gate.
- `service.ts` is the only code that changes orders: create, mark paid, make proofs, approve, request changes, make print files, change stage.

### 4.6 Payment — `checkout.ts`, the webhook, and `markPaid`

1. Checkout creates an order in **Quote** with the server's price, then asks Stripe for a Checkout page with two lines: the goods and the VAT.
2. The customer pays on Stripe's page.
3. Stripe tells us **twice**: it redirects the customer to `/checkout/success`, and it calls our webhook `/api/stripe/webhook`. Either may arrive first; either may fail.
4. Both call `markPaid()`. It does one conditional update: "set paid_at **where** paid_at is empty **and** status is quote **and** the amount and currency match". Only one caller can win that update. The winner runs `fulfil()`: invoice, emails, first proof.
5. If the follow-up work fails, the webhook returns 500 so Stripe retries later, and the retry finishes the job.

The webhook checks Stripe's **signature** on the raw request body, so a fake "payment succeeded" message is rejected (tested on the live site: "Invalid signature").

### 4.7 Proofs — `storeProof`, `approveProof`, `requestChanges`

- Each proof has a version (v1, v2…) and stores a **frozen copy** of the design. Later edits cannot change a proof that was already approved.
- Approve or request changes is logged in `proof_events` (who, when, note).
- A new proof marks older pending ones as superseded and deletes print files made from an older version.
- Proofs can only be sent for paid jobs that are not yet in production.

### 4.8 Print files — `src/lib/print/render.ts`

From the approved proof's document:

- **PDF**: vector, trim size plus bleed, crop marks, and a slug line (order, size, quantity) outside the trim.
- **PNG**: at the product's dpi (300, or 600 for stamps, trophies and laser-cut).
- **SVG**: for laser and vinyl cutters.
- **ZIP** for CSV jobs: one PDF per row.
- Names follow `OrderID_ProductType_Date_Output` (the PRD's pattern).

Files live in the private `print-files` bucket, which customers have no access to at all.

### 4.9 Security model (say this clearly in an interview)

There are **three layers**, and each would stop an attack on its own:

1. **The proxy** (`proxy.ts`) bounces signed-out visitors from private pages. This is for convenience, not security.
2. **Server checks**: every page and action calls `requireUser()` or `requireAdmin()`. Prices, CSV row counts and file paths are recomputed or checked on the server.
3. **The database** (Row Level Security): every table has policies. A customer's database login can only read their own orders, even if they bypass our app and call Supabase directly with the public key. `scripts/rls-check.ts` proves this with two real test customers (18 checks).

Other points:

- **Files** are private. Downloads go through `/files/...`, which checks permission and then gives a link that works for 60 seconds.
- **Storage paths** must be plain names (no `..`, `%`, `\`). This rule is in `storage-path.ts` and repeated in the database (migration 0005), so a customer cannot point a design at another customer's file or at the print-files bucket.
- **Secrets** live only in `.env.local` (git-ignored) and Vercel's settings. The service-role key is only used on the server (`import "server-only"`).
- **Roles**: a trigger stops customers making themselves admin, and stops the last admin being removed.

### 4.10 Next.js 16 things worth knowing

- **Cache Components / Partial Prerendering**: each page's static shell is prebuilt and served instantly; the per-user parts stream in inside `<Suspense>`. The catalogue uses `'use cache'` and is refreshed when staff edit products (`updateTag`).
- **`proxy.ts`** is Next 16's new name for `middleware.ts`.
- **Server Actions** (`"use server"`) replace most API routes: the browser calls a function, the server runs it.
- **`after()`** runs work after the response is sent (used for status emails and CSV merges).
- **error.tsx** receives `retry` (not `reset` as in older versions).

## 5. One order's life, click by click

| Step | What the customer does | What happens in the system |
|---|---|---|
| 1 | Opens Product labels, sets 90×60 mm, gloss, 250 | `calculatePrice` runs in the browser on every change. Nothing is saved. |
| 2 | Clicks "Design it" | `products/actions.ts` inserts a **designs** row with the template copied in, then opens `/design/<id>`. |
| 3 | Edits text, adds a logo | Logo uploads to `uploads/<user>/<design>/…`; `saveDesign` validates and saves the document (autosave). |
| 4 | Clicks "Pay" | `checkout` action: saves, `createOrderFromDesign` inserts **orders** (status quote, server price) and **order_items** (frozen product snapshot, design copy), then Stripe Checkout starts. |
| 5 | Pays with 4242… | Stripe calls the webhook and redirects to the success page. `markPaid` claims the order (paid_at, Stripe ids). `fulfil`: status → order → artwork, **invoices** row + PDF in `invoices/`, **proofs** v1 + PNG in `proofs/`, status → proof, emails logged in **email_log**. |
| 6 | Approves proof v1 | **proofs** status approved, **proof_events** row, staff email. |
| 7 | (Staff) Generate print files | `generatePrintFiles`: PDF, PNG, SVG into `print-files/orders/DH-…/`, **print_files** rows. Job board shows "files ready". |
| 8 | (Staff) Move to Production, then Completed | `setStatus` checks the gate, writes **order_events**, the customer gets an email. |
| 9 | Clicks "Reorder" | `reorder` copies the approved proof's document into a new design and starts a new order at **today's** price. |

## 6. How to run and check it

```bash
npm run dev          # local site on http://localhost:3000
npm test             # unit tests (pricing, layout, pipeline, CSV, paths, rendering)
npm run typecheck    # TypeScript
npm run lint         # ESLint
npm run rls:check    # privacy between two real customers
npm run build        # production build
```

## 7. Interview questions, with answers

**Q: Walk me through your architecture.**
A Next.js 16 app on Vercel, with Supabase for Postgres, login and file storage, and Stripe for payments. Pages are Server Components; changes go through Server Actions. All order logic lives in one service module. One shared layout engine draws the browser preview, the proof and the print files.

**Q: How do you make sure what the customer approves is what gets printed?**
Two things. First, the same code (`svg.ts` + `layout.ts`) draws the preview, the proof and the print files. Second, each proof stores a frozen copy of the design, and print files are made only from the approved proof's copy, never from the live design.

**Q: How do you stop someone paying less than the real price?**
The browser's price is display-only. At checkout the server recalculates from the database and sends that amount to Stripe. When Stripe confirms payment, we also check the amount and currency match the order before marking it paid.

**Q: Stripe calls your webhook and the customer lands on the success page at the same time. What stops the order being processed twice?**
Both call `markPaid`, which does a single conditional update: only set `paid_at` where it is still empty. Postgres runs that atomically, so only one caller gets the row back, and only that caller runs the follow-up work.

**Q: What if the follow-up work (invoice, proof) fails halfway?**
The webhook returns 500, so Stripe retries. On the retry, the order is already paid, so `markPaid` sees "paid but no invoice" and runs the follow-up again. Each step checks whether it is already done (invoice exists? proof exists?), so repeating is safe.

**Q: How is customer data kept private?**
Row Level Security in Postgres. Every table has policies like "you can read an order if you own it, or you're an admin". It works even if someone skips our app and calls Supabase directly with the public key. I test it with two real customer logins in `rls-check.ts`.

**Q: Why store money in pence?**
Floating-point numbers can't represent most decimals exactly, so totals drift by fractions of a penny. Integers are exact. I round once, at the item total.

**Q: How do volume discounts work?**
Each product has tiers in the database (for example 250+ = 15%). The highest tier the quantity reaches applies to the item cost (not the setup fee). The configurator also shows "order N more to save X%".

**Q: How does the CSV merge for race numbers work?**
The customer uploads a CSV. Each row is checked for fit with the same `fitText` function the designer uses, and problems are shown per row before payment. At checkout the server re-counts the rows. After approval, the server renders one PDF per row and zips them.

**Q: Why didn't you use Fabric.js or another canvas library?**
A canvas library only runs in the browser, so the server would need a different renderer for print files, and the two could disagree. An SVG designer lets the browser and server share one drawing function.

**Q: Why no shadcn/ui?**
I safety-checked it. Its setup replaces the project's design tokens with its stock look, which the brief asked to avoid. The components are small and hand-built on Tailwind instead, and I audited them against Vercel's web-design guidelines.

**Q: What did the security review find, and what did you fix?**
The main finding was path tricks: a design could reference `..` or URL-encoded dots to reach another bucket. I fixed it with one path rule used by every storage call, repeated as a database trigger, plus tests. I also made the database refuse direct edits that point a design at someone else's file, stopped customers changing the email orders go to, checked the Stripe amount, and added security headers.

**Q: What would you do next with more time?**
Email confirmation and a CAPTCHA on sign-up; a job queue for big CSV merges and webhook work; a database function so order creation is one transaction; paging for reports; and the live Xero API instead of the CSV export.

**Q: How would a new product family be added?**
Insert a division row and product rows (size limits, materials, pricing, bleed, dpi) and optionally templates. No code change: the storefront, configurator, pricing and print engine all read from those rows.

**Q: How do you handle a file a customer uploads that isn't what it says?**
`attachUpload` reads the first bytes: a PNG must start with the PNG signature, a PDF with `%PDF`, and so on. A renamed file is rejected. AI and PDF uploads are flagged for a staff proof.

**Q: What is the proxy for if the database already enforces privacy?**
It gives a faster, friendlier redirect to the login page. It is not trusted for security; the page and the database each check again.
