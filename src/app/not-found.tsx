/**
 * Shown for any unknown URL and whenever a page calls notFound() — for
 * example an order that isn't yours. It says what happened and offers the
 * two places most people were heading.
 */
import Link from "next/link";

export default function NotFound() {
  return (
    <section className="mx-auto max-w-xl py-16">
      <h1 className="text-3xl font-extrabold">We can&apos;t find that page</h1>
      <p className="mt-3 text-steel">
        The link may be old, or the page may belong to another account. Your orders and proofs are always under Your account.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link className="btn-primary" href="/products">Browse products</Link>
        <Link className="btn-secondary" href="/account">Your account</Link>
      </div>
    </section>
  );
}
