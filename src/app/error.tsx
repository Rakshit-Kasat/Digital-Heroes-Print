"use client"; // Error boundaries must be Client Components

/**
 * Catches anything that throws while rendering a page (a database timeout,
 * a dropped connection). Nothing the customer did is lost: designs save as
 * they go and paid orders are confirmed by Stripe's webhook as well.
 */
import Link from "next/link";
import { useEffect } from "react";

export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section className="mx-auto max-w-xl py-16" role="alert">
      <h1 className="text-3xl font-extrabold">This page didn&apos;t load</h1>
      <p className="mt-3 text-steel">
        Something went wrong on our side. Your designs and orders are saved. Try again, or go back to your account.
      </p>
      {error.digest && <p className="mt-2 text-xs text-steel">Reference: {error.digest}</p>}
      <div className="mt-6 flex flex-wrap gap-3">
        <button className="btn-primary" onClick={() => retry()}>Try again</button>
        <Link className="btn-secondary" href="/account">Your account</Link>
      </div>
    </section>
  );
}
