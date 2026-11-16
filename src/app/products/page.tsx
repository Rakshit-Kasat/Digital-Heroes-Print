import type { Metadata } from "next";
import Link from "next/link";
import { getCatalog } from "@/lib/catalog/queries";

export const metadata: Metadata = { title: "All products" };

export default async function ProductsPage() {
  const { divisions, products } = await getCatalog();
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <h1 className="text-4xl font-extrabold">All products</h1>
      <p className="mt-2 max-w-2xl text-steel">Each product takes your own size in millimetres. Pick one to see the live price and preview.</p>
      <div className="mt-10 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
        {divisions.map((d) => (
          <section key={d.id} aria-labelledby={`d-${d.slug}`}>
            <h2 id={`d-${d.slug}`} className="border-b-2 border-ink pb-2 text-xl font-bold">
              <Link href={`/products/${d.slug}`} className="hover:underline">{d.name}</Link>
            </h2>
            <ul className="mt-3 divide-y divide-hairline">
              {products.filter((p) => p.division_id === d.id).map((p) => (
                <li key={p.id}>
                  <Link href={`/products/${d.slug}/${p.slug}`} className="block py-3 hover:bg-sheet">
                    <span className="font-semibold">{p.name}</span>
                    <span className="block text-sm text-steel">{p.summary}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
