import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-hairline">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 text-sm text-steel sm:grid-cols-3 sm:px-6">
        <div>
          <p className="font-display font-bold text-ink">Digital Heroes Print</p>
          <p className="mt-2 max-w-xs">Labels, race numbers, MTB boards, stamps, trophies and laser-cut work, made from artwork you approve.</p>
        </div>
        <div className="flex flex-col gap-2">
          <Link className="hover:text-ink" href="/products">All products</Link>
          <Link className="hover:text-ink" href="/gallery">Gallery</Link>
          <Link className="hover:text-ink" href="/account">Your account</Link>
        </div>
        <p>Test environment: payments run in Stripe test mode. Use card 4242 4242 4242 4242, any future date and any CVC.</p>
      </div>
    </footer>
  );
}
