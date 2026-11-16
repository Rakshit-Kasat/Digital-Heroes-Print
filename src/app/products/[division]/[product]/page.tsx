import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { findProduct, getCatalog } from "@/lib/catalog/queries";
import { Configurator } from "./configurator";

/** Prerender every product page at build time; new products render on first visit. */
export async function generateStaticParams() {
  const { divisions, products } = await getCatalog();
  return products.map((p) => ({ division: divisions.find((d) => d.id === p.division_id)!.slug, product: p.slug }));
}

export async function generateMetadata({ params }: PageProps<"/products/[division]/[product]">): Promise<Metadata> {
  const { division, product } = await params;
  const found = await findProduct(division, product);
  return found ? { title: found.product.name, description: found.product.summary } : {};
}

/**
 * The shell (page frame) is shared by every product URL; the URL-specific
 * part reads params inside <Suspense> so client navigation is instant. The
 * catalogue is cached, so on the server this resolves immediately.
 */
export default function ProductPage({ params }: PageProps<"/products/[division]/[product]">) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <Suspense fallback={<div className="space-y-4"><div className="h-5 w-48 rounded bg-mist" /><div className="h-10 w-72 rounded bg-mist" /><div className="h-[560px] animate-pulse rounded-lg bg-mist" /></div>}>
        <ProductBody params={params} />
      </Suspense>
    </div>
  );
}

async function ProductBody({ params }: Pick<PageProps<"/products/[division]/[product]">, "params">) {
  const { division, product } = await params;
  const found = await findProduct(division, product);
  if (!found) notFound();
  const p = found.product;
  return (
    <>
      <nav aria-label="Breadcrumb" className="text-sm text-steel">
        <Link className="hover:text-ink" href="/products">Products</Link> / <Link className="hover:text-ink" href={`/products/${found.division.slug}`}>{found.division.name}</Link>
      </nav>
      <h1 className="mt-3 text-4xl font-extrabold">{p.name}</h1>
      <p className="mt-2 max-w-2xl text-steel">{p.summary} {p.description}</p>
      <div className="mt-8">
        <Suspense fallback={<div className="h-[560px] animate-pulse rounded-lg bg-mist" />}>
          <Configurator product={p} templates={found.templates} divisionSlug={found.division.slug} />
        </Suspense>
      </div>
    </>
  );
}
