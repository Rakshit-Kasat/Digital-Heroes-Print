import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { findDivision, getCatalog } from "@/lib/catalog/queries";
import { resolvedSamples } from "@/lib/catalog/sample-docs";
import { MatPiece } from "@/components/print-sheet";
import { calculatePrice, formatMoney, VAT_RATE } from "@/lib/pricing/calculate";

export async function generateStaticParams() {
  const { divisions } = await getCatalog();
  return divisions.map((d) => ({ division: d.slug }));
}

export async function generateMetadata({ params }: PageProps<"/products/[division]">): Promise<Metadata> {
  const found = await findDivision((await params).division);
  return found ? { title: found.division.name, description: found.division.tagline } : {};
}

/** Frame shared by every division URL; the params read streams inside Suspense. */
export default function DivisionPage({ params }: PageProps<"/products/[division]">) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <Suspense fallback={<div className="space-y-4"><div className="h-10 w-72 rounded bg-mist" /><div className="grid gap-6 md:grid-cols-2"><div className="h-96 rounded-lg bg-mist" /><div className="h-96 rounded-lg bg-mist" /></div></div>}>
        <DivisionBody params={params} />
      </Suspense>
    </div>
  );
}

async function DivisionBody({ params }: Pick<PageProps<"/products/[division]">, "params">) {
  const found = await findDivision((await params).division);
  if (!found) notFound();
  const samples = resolvedSamples(found.products, found.templates);
  return (
    <>
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
                {/* Samples on the mat at the same scale, so the two sizes compare honestly. */}
                <div className="mat flex h-60 items-end justify-center gap-6 p-6 [--k:0.8px] sm:[--k:0.9px]">
                  {art.slice(0, 2).map((a) => <MatPiece key={a.sample.title} doc={a.doc} label={a.sample.title} />)}
                </div>
                <div className="p-5">
                  <h2 className="text-xl font-bold group-hover:underline">{p.name}</h2>
                  <p className="mt-1 text-sm text-steel">{p.summary}</p>
                  <p className="mt-3 text-sm">
                    <span className="block tabular-nums">Any size from {s.width.min} × {s.height.min} to {s.width.max} × {s.height.max} mm, in {s.materials.length} materials.</span>
                    <span className="mt-1 block tabular-nums"><span className="font-semibold">{formatMoney(price.totalPence)}</span> <span className="text-steel">for {s.quantity.default} at {s.width.default} × {s.height.default} mm, inc. VAT</span></span>
                  </p>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
