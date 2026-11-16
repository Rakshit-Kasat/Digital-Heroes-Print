# Redesign audit: the site as it stands (2026-11-17)

Screens: `docs/redesign/before/*.png`. There are 17 screens, each at 375 px and 1280 px, for a guest, a customer and staff. They were made with `node scripts/screens.ts docs/redesign/before`.
Static lint: Hallmark `sloplint` found 9 FAIL, 2 REFLEX and 3 WARN. The full list is in `.hallmark/before.txt`. The structure record is in `.hallmark/before.json`: 54 links, 31 fields and 86 handlers that the redesign must keep.

## The read

- **What it is for:** clubs, event organisers and small brands order custom print. The one action is to get a price and order. Staff run each job to finished files.
- **What works and stays:**
  - the print sheet (a live render of a real job, with trim, bleed and safe-area marks);
  - instant pricing;
  - the stage tracker;
  - the clear proof history on the job page;
  - the honest copy.
- **What reads as generated:**
  - a split hero (headline left, form card right);
  - six identical product cards with grey thumbnail wells;
  - six numbered steps in two equal rows;
  - a dark band at the end;
  - one magenta on every button, link and badge;
  - every admin block is the same white card with the same border.

  Nothing is broken, but it could be any SaaS template. It doesn't feel like a print house.
- **What is broken:**
  - Home, "What we make": the MTB board sample overflows its tile and covers the "MTB boards" title and blurb.
  - Designer: the "Save design" button and the Stripe test-mode note run into each other.
  - The staff proof form has two "Note to the customer" fields side by side; it's unclear which one goes with which button.

## Findings by screen (worst first)

| # | Screen | Finding | Depth to fix |
|---|---|---|---|
| 1 | Home | The hero is a template split. The print sheet (the most distinctive thing on the site) sits below the fold on desktop, under the headline. | full |
| 2 | Home | Product grid: six identical cards with identical grey wells. Nothing shows scale, material or how the products differ. | full |
| 3 | All | One accent for everything (buttons, links, badges, steps, bands), so nothing stands out. | restyle |
| 4 | All | The typography is one sans at near-uniform weights. There is no display moment and no figure style for prices, sizes and order numbers, though a print shop lives on numbers. | restyle |
| 5 | Product page | Configurator form fields stack like a settings page. There is no physical sense of the size you chose (no actual-size preview or ruler). | full |
| 6 | Designer | The toolbar is a row of plain buttons. The right column holds three equal cards (Page, Print check, Order), so the print check doesn't stand out. "Save design" collides with the note. | full (app screen) |
| 7 | Account / order | Card stacks, with the stage tracker as thin bars. Proofs to review should lead the account page when one is waiting. | full (app screen) |
| 8 | Staff job page | Every block is the same card. The next action (move, proof, files) is not ranked above history and emails. There are two ambiguous note fields. | full (app screen) |
| 9 | Job board / tables | Fine but plain. It needs denser rows, tabular figures and status read at a glance. | restyle |
| 10 | Lint | Dashes in copy (`quick-quote.tsx:73`, `admin/products/page.tsx:56`); middle-dot meta strings (4); the "Paid ·" eyebrow on the success page; a colour literal outside the tokens; no `overflow-x: clip`; glass header; ::selection and scrollbar not themed; no :active or :disabled states. | polish |

## Keep list (wiring and content the redesign must not lose)

- every link, form field, Server Action and handler (`.hallmark/before.json`);
- all copy facts: prices, sizes, dpi, bleed, the stage names and test-mode notes;
- routes and components stay; only markup and styles change inside each component.
