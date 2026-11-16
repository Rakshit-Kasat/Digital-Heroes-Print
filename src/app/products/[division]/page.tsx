import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { findDivision, getCatalog } from "@/lib/catalog/queries";
import { resolvedSamples } from "@/lib/catalog/sample-docs";
import { PrintArt } from "@/components/print-sheet";
import { calculatePrice, formatMoney, VAT_RATE } from "@/lib/pricing/calculate";

export async function generateStaticParams() {
  const { divisions } = await getCatalog();
  return divisions.map((d) => ({ division: d.slug }));
}

export async function generateMetadata({ params }: PageProps<"/products/[division]">): Promise<Metadata> {
  const found = await findDivision((await params).division);
  return found ? { title: found.division.name, description: found.division.tagline } : {};
}

export default async function DivisionPage({ params }: PageProps<"/products/[division]">) {
  const found = await findDivision((await params).division);
  if (!found) notFound();
  const samples = resolvedSamples(found.products, found.templates);
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <nav aria-label="Breadcrumb" className="text-sm text-steel"><Link className="hover:text-ink" href="/products">Products</Link></nav>
      <h1 className="mt-3 text-4xl font-extrabold">{found.division.name}</h1>
      <p className="mt-2 max-w-2xl text-steel">{found.division.tagline}</p>
      <ul className="mt-10 grid gap-6 md:grid-cols-2">
        {found.products.map((p) => {
          const art = samples.filter((s) => s.product.id === p.id);
          const s = p.config_schema;
          const price = calculatePrice(s, p.pricing, { widthMm: s.width.default, heightMm: s.height.default, materialId: s.materials[0].id, quantity: s.quantity.default }, VAT_RATE);
          return (
            <li key={p.id} className="panel overflow-hidden">
              <Link href={`/products/${found.division.slug}/${p.slug}`} className="group block">
                <div className="flex h-60 items-center justify-center gap-4 bg-mist p-6">
                  {art.slice(0, 2).map((a) => <PrintArt key={a.sample.title} doc={a.doc} label={a.sample.title} className="max-h-full w-1/2 max-w-[240px] drop-shadow-sm" />)}
                </div>
                <div className="p-5">
                  <h2 className="text-xl font-bold group-hover:underline">{p.name}</h2>
                  <p className="mt-1 text-sm text-steel">{p.summary}</p>
                  <p className="mt-3 text-sm">
                    Any size from {s.width.min}×{s.height.min} to {s.width.max}×{s.height.max} mm · {s.materials.length} materials ·{" "}
                    <span className="font-semibold">{formatMoney(price.totalPence)}</span> <span className="text-steel">for {s.quantity.default} at {s.width.default}×{s.height.default} mm, inc. VAT</span>
                  </p>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
