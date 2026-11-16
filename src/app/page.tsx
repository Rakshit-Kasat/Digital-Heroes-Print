/**
 * Home. Fully prerendered: the catalogue is cached and the artwork is drawn
 * by our own print engine at build/revalidate time — the hero sheet is a
 * real output of the system, not an illustration.
 */
import Link from "next/link";
import { getCatalog } from "@/lib/catalog/queries";
import { resolvedSamples } from "@/lib/catalog/sample-docs";
import { AnnotatedSheet, PrintArt } from "@/components/print-sheet";
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

  return (
    <>
      <section className="mx-auto grid max-w-7xl gap-10 px-4 pb-16 pt-10 sm:px-6 lg:grid-cols-[1.15fr_1fr] lg:gap-14 lg:pt-16">
        <div>
          <h1 className="max-w-2xl text-4xl font-extrabold leading-[1.05] sm:text-5xl lg:text-[3.5rem]">
            Any size. Priced as you type. Proofed before it prints.
          </h1>
          <p className="mt-5 max-w-xl text-lg text-steel">
            Labels, race numbers, MTB boards, stamps, trophy plates and laser-cut signs, made to your measurements.
            Design in the browser or upload your file, approve the proof, and we print exactly that.
          </p>
          <div className="mt-8 sheet-shadow max-w-2xl rounded-sm bg-sheet p-3 sm:p-5">
            {hero && <AnnotatedSheet doc={hero.doc} label="A race bib proof with crop marks, 3 mm bleed and the safe area marked" />}
          </div>
          <p className="mt-3 max-w-2xl text-sm text-steel">
            This sheet is drawn by the same engine that makes your print file: the number shrinks to fit its box, and the colour band runs into the bleed so the cut never leaves a white edge.
          </p>
        </div>
        <div className="lg:pt-2">
          <QuickQuote products={quoteProducts} initial="race-bibs" />
        </div>
      </section>

      <section aria-labelledby="divisions" className="border-y border-hairline bg-sheet">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
          <h2 id="divisions" className="text-3xl font-extrabold">Six workshops, one order flow</h2>
          <p className="mt-2 max-w-2xl text-steel">Every product is set up as rules, not fixed sizes: choose any width and height in range, and the price follows.</p>
          <ul className="mt-8 grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-hairline bg-hairline sm:grid-cols-2 lg:grid-cols-3">
            {divisions.map((d) => {
              const divProducts = products.filter((p) => p.division_id === d.id);
              const art = samples.find((s) => divProducts.some((p) => p.id === s.product.id));
              const first = divProducts[0];
              const from = first ? calculatePrice(first.config_schema, first.pricing, { widthMm: first.config_schema.width.default, heightMm: first.config_schema.height.default, materialId: first.config_schema.materials[0].id, quantity: first.config_schema.quantity.default }, VAT_RATE) : null;
              return (
                <li key={d.id} className="bg-sheet">
                  <Link href={`/products/${d.slug}`} className="group flex h-full flex-col p-6 hover:bg-paper">
                    <div className="flex h-44 items-center justify-center rounded bg-mist p-5">
                      {art && <PrintArt doc={art.doc} label={art.sample.title} className="w-full max-w-[220px] max-h-full drop-shadow-sm transition-transform duration-200 group-hover:-translate-y-0.5" />}
                    </div>
                    <h3 className="mt-5 text-xl font-bold">{d.name}</h3>
                    <p className="mt-1 text-sm text-steel">{d.tagline}</p>
                    {from && first && <p className="mt-3 text-sm"><span className="font-semibold">{formatMoney(from.unitPence, "GBP", true)}</span> <span className="text-steel">each for {first.config_schema.quantity.default} {first.name.toLowerCase()}, ex VAT</span></p>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      <section id="how-it-works" aria-labelledby="how" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-16 sm:px-6">
        <h2 id="how" className="text-3xl font-extrabold">How an order runs</h2>
        <p className="mt-2 max-w-2xl text-steel">The same six stages you can follow from your account, from first click to finished job.</p>
        <ol className="mt-8 grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="border-t-2 border-ink pt-4">
              <p className="font-display text-sm font-bold text-accent">Stage {i + 1}</p>
              <h3 className="mt-1 text-lg font-bold">{s.title}</h3>
              <p className="mt-1 text-sm text-steel">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="merge" className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="grid items-center gap-10 rounded-lg bg-ink p-6 text-paper sm:p-10 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <h2 id="merge" className="text-3xl font-extrabold">Five hundred runners, one upload</h2>
            <p className="mt-3 text-paper/75">
              Upload your entry list as a CSV and every bib or board is made with the right name and number.
              Long names shrink to fit within a minimum size, and any row that still will not fit is reported before printing.
            </p>
            <Link href="/products/race-numbers/race-bibs" className="btn mt-6 bg-paper text-ink hover:bg-white">Start a race-number order</Link>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {merged.map((m) => (
              <figure key={m.sample.title}>
                <PrintArt doc={m.doc} label={m.sample.title} className="rounded-sm bg-white" />
                <figcaption className="mt-2 text-xs text-paper/60">{m.sample.title}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
