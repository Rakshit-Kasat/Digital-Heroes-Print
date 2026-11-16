/**
 * Home. Fully prerendered: the catalogue is cached and every piece of art
 * is drawn by our own print engine at build/revalidate time, so what lies
 * on the mat is real output of the system, not an illustration.
 *
 * Layout: a short headline, then the signature, one sample from each
 * family laid on the cutting mat at true relative scale (one small square
 * is 10 mm). The quote, the proof sheet and the stages follow.
 */
import Link from "next/link";
import { getCatalog } from "@/lib/catalog/queries";
import { resolvedSamples } from "@/lib/catalog/sample-docs";
import { AnnotatedSheet, MatPiece, PrintArt } from "@/components/print-sheet";
import { QuickQuote } from "@/components/quick-quote";
import { calculatePrice, formatMoney, VAT_RATE } from "@/lib/pricing/calculate";

const STEPS = [
  { title: "Configure", body: "Pick a product, enter your size in millimetres, choose the material and quantity. The price updates as you go." },
  { title: "Design or upload", body: "Edit a template in the browser, locked to the printable area, or upload a PDF, SVG, AI or PNG." },
  { title: "Pay", body: "Secure card checkout. Your VAT invoice is ready straight away." },
  { title: "Approve the proof", body: "Check the proof with trim and safe lines marked. Approve it, or ask for changes and get a new version." },
  { title: "Production", body: "Approval unlocks print-ready files. Nothing goes to press before you say yes." },
  { title: "Completed", body: "Your order history keeps the artwork, so a reorder takes one click." },
];

export default async function Home() {
  const { divisions, products, templates } = await getCatalog();
  const samples = resolvedSamples(products, templates);
  const hero = samples.find((s) => s.sample.product === "race-bibs");
  const merged = samples.filter((s) => s.sample.product === "race-bibs").slice(0, 2);
  const divSlug = (id: string) => divisions.find((d) => d.id === id)?.slug ?? "";
  const quoteProducts = products.map((p) => ({ slug: p.slug, name: p.name, divisionSlug: divSlug(p.division_id), config_schema: p.config_schema, pricing: p.pricing }));

  // One piece per family for the mat: the first sample of the family's first product.
  const pieces = divisions.flatMap((d) => {
    const divProducts = products.filter((p) => p.division_id === d.id);
    const art = samples.find((s) => divProducts.some((p) => p.id === s.product.id));
    if (!art) return [];
    const first = divProducts[0];
    const from = calculatePrice(first.config_schema, first.pricing, { widthMm: first.config_schema.width.default, heightMm: first.config_schema.height.default, materialId: first.config_schema.materials[0].id, quantity: first.config_schema.quantity.default }, VAT_RATE);
    return [{ division: d, art, from, first }];
  });

  return (
    <>
      <section className="mx-auto max-w-7xl px-4 pb-8 pt-8 sm:px-6 lg:pt-12">
        <div className="grid gap-6 lg:grid-cols-[1fr_minmax(0,29rem)] lg:items-end lg:gap-12">
          <h1 className="max-w-[16ch] text-[2.5rem] font-extrabold sm:text-5xl lg:text-[3.6rem]">Print you can measure before you order.</h1>
          <div>
            <p className="max-w-[46ch] text-lg text-steel">
              Labels, race numbers, MTB boards, stamps, trophy plates and laser-cut signs, made to your measurements.
              Design in the browser or upload your file, approve the proof, and we print exactly that.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <a className="btn-primary" href="#quote">Get a price</a>
              <Link className="btn-secondary" href="/products">Browse products</Link>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="divisions" className="mat [--k:0.62px] sm:[--k:0.8px] lg:[--k:1px]">
        <h2 id="divisions" className="sr-only">What we make</h2>
        <ul className="mx-auto flex max-w-7xl flex-wrap items-end gap-x-5 gap-y-7 px-4 py-8 sm:px-6 lg:justify-between lg:gap-x-4 lg:py-10">
          {pieces.map(({ division, art, from, first }) => (
            <li key={division.id} style={{ width: `max(7.5rem, calc(${art.doc.widthMm} * var(--k)))` }}>
              <Link href={`/products/${division.slug}`} className="group grid justify-items-start gap-2.5 rounded-sm focus-visible:outline-mat-ink">
                <span className="transition-transform duration-200 group-hover:-translate-y-1"><MatPiece doc={art.doc} label={art.sample.title} /></span>
                <span className="rounded-[3px] bg-paper px-2.5 py-1 text-[13px] leading-tight text-ink sm:text-sm">
                  <span className="block font-display font-bold group-hover:underline">{division.name}</span>
                  <span className="block tabular-nums text-steel">{art.doc.widthMm} × {art.doc.heightMm} mm</span>
                  <span className="block tabular-nums text-steel">from {formatMoney(from.unitPence, "GBP", true)}</span>
                  <span className="sr-only"> each for {first.config_schema.quantity.default}, ex VAT</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="mx-auto max-w-7xl px-4 pb-5 text-sm text-mat-ink/85 sm:px-6">Every piece is drawn to scale. One small square is 10 mm. Prices are per item at each product&apos;s starting quantity, ex VAT.</p>
      </section>

      <section aria-labelledby="quote-h" className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[minmax(0,26rem)_1fr] lg:gap-14">
        <div>
          <h2 id="quote-h" className="sr-only">Get a price</h2>
          <QuickQuote products={quoteProducts} initial="race-bibs" />
        </div>
        <div>
          <h2 className="text-3xl font-extrabold">The proof you approve is the file we print</h2>
          <p className="mt-3 max-w-[60ch] text-steel">
            This sheet is drawn by the same engine that makes your print file: the number shrinks to fit its box, and the colour band runs into the bleed so the cut never leaves a white edge.
          </p>
          <div className="mt-6 sheet-shadow max-w-2xl rounded-sm bg-sheet p-3 sm:p-5">
            {hero && <AnnotatedSheet doc={hero.doc} label="A race bib proof with crop marks, 3 mm bleed and the safe area marked" />}
          </div>
        </div>
      </section>

      <section id="how-it-works" aria-labelledby="how" className="mx-auto max-w-7xl scroll-mt-20 px-4 pb-16 sm:px-6">
        <h2 id="how" className="text-3xl font-extrabold">From artwork to finished job</h2>
        <p className="mt-2 max-w-2xl text-steel">The same six stages you can follow from your account, from first click to finished job.</p>
        <ol className="mt-8 grid gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-6">
          {STEPS.map((s, i) => (
            <li key={s.title} className="border-t-[5px] border-mat pt-3">
              <h3 className="text-lg font-bold"><span className="tabular-nums text-steel">{i + 1}.</span> {s.title}</h3>
              <p className="mt-1 text-[15px] text-steel">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="merge" className="mat [--k:1px]">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1fr_1.2fr] lg:py-16">
          <div>
            <h2 id="merge" className="text-3xl font-extrabold text-mat-ink">Five hundred runners, one upload</h2>
            <p className="mt-3 max-w-[52ch] text-mat-ink/85">
              Upload your entry list as a CSV and every bib or board is made with the right name and number.
              Long names shrink to fit within a minimum size, and any row that still will not fit is reported before printing.
            </p>
            <Link href="/products/race-numbers/race-bibs" className="btn-primary mt-6">Start a race-number order</Link>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {merged.map((m) => (
              <figure key={m.sample.title}>
                <PrintArt doc={m.doc} label={m.sample.title} className="bg-sheet shadow-[3px_3px_0_0_color-mix(in_oklab,var(--color-ink)_35%,transparent)]" />
                <figcaption className="mt-2 text-sm text-mat-ink/85">{m.sample.title}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
