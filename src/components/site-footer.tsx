import Link from "next/link";

// The studio inbox, taken from the sending address so there is one place to change it.
const CONTACT = process.env.EMAIL_FROM?.match(/<(.+)>/)?.[1] ?? process.env.SMTP_USER ?? "";

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-hairline">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 text-sm text-steel sm:grid-cols-3 sm:px-6">
        <div>
          <p className="font-display font-bold text-ink">Digital Heroes Print</p>
          <p className="mt-2 max-w-xs">Labels, race numbers, MTB boards, stamps, trophies and laser-cut work, made from artwork you approve.</p>
          {CONTACT && <p className="mt-3">Questions about an order? Email <a className="link" href={`mailto:${CONTACT}`}>{CONTACT}</a>. We reply within one working day.</p>}
        </div>
        <div className="flex flex-col">
          <Link className="inline-flex min-h-11 items-center hover:text-ink" href="/products">All products</Link>
          <Link className="inline-flex min-h-11 items-center hover:text-ink" href="/gallery">Gallery</Link>
          <Link className="inline-flex min-h-11 items-center hover:text-ink" href="/account">Your account</Link>
        </div>
        <p>Test environment: payments run in Stripe test mode. Use card 4242 4242 4242 4242, any future date and any CVC.</p>
      </div>
    </footer>
  );
}
