import type { Metadata } from "next";
import Link from "next/link";
import { getCatalog } from "@/lib/catalog/queries";
import { resolvedSamples } from "@/lib/catalog/sample-docs";
import { PrintArt } from "@/components/print-sheet";

export const metadata: Metadata = { title: "Gallery", description: "Examples of every product, rendered by the same engine that makes the print files." };

export default async function GalleryPage() {
  const { divisions, products, templates } = await getCatalog();
  const samples = resolvedSamples(products, templates);
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <h1 className="text-4xl font-extrabold">Gallery</h1>
      <p className="mt-2 max-w-2xl text-steel">
        Every example below is drawn by our print engine from a real template and real sizes, exactly as it would appear on your proof.
      </p>
      {divisions.map((d) => {
        const items = samples.filter((s) => s.product.division_id === d.id);
        if (!items.length) return null;
        return (
          <section key={d.id} aria-labelledby={`g-${d.slug}`} className="mt-12">
            <div className="flex items-baseline justify-between border-b border-hairline pb-2">
              <h2 id={`g-${d.slug}`} className="text-2xl font-bold">{d.name}</h2>
              <Link className="link text-sm" href={`/products/${d.slug}`}>Order {d.name.toLowerCase()}</Link>
            </div>
            <ul className="mt-6 grid grid-cols-2 gap-6 md:grid-cols-3 lg:grid-cols-4">
              {items.map((s) => (
                <li key={s.sample.title}>
                  <figure>
                    <div className="flex aspect-square items-center justify-center rounded bg-mist p-4">
                      <PrintArt doc={s.doc} label={s.sample.title} className="max-h-full w-full drop-shadow-sm" />
                    </div>
                    <figcaption className="mt-2 text-sm">
                      <span className="font-medium">{s.sample.title}</span>
                      <span className="block text-steel">{s.sample.widthMm} × {s.sample.heightMm} mm, {s.product.name}</span>
                    </figcaption>
                  </figure>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
