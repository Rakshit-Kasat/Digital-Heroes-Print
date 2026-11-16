/**
 * Header. The nav is static (part of the prerendered shell); only the
 * account area reads the session, so it streams in behind <Suspense>.
 */
import Link from "next/link";
import { Suspense } from "react";
import { getUser } from "@/lib/auth";
import { signOut } from "@/app/(auth)/actions";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-hairline bg-paper">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:gap-6 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2.5 whitespace-nowrap font-display text-[17px] font-extrabold tracking-tight">
          <Mark /> Digital Heroes <span className="hidden font-medium text-steel sm:inline">Print</span>
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-5 text-sm font-medium text-steel md:flex">
          <Link className="hover:text-ink" href="/products">Products</Link>
          <Link className="hover:text-ink" href="/gallery">Gallery</Link>
          <Link className="hover:text-ink" href="/#how-it-works">How it works</Link>
        </nav>
        <div className="-mr-2 ml-auto flex items-center whitespace-nowrap text-sm sm:mr-0 sm:gap-2">
          <Suspense fallback={<span className="h-9 w-20" aria-hidden />}>
            <AccountArea />
          </Suspense>
        </div>
      </div>
      <nav aria-label="Main mobile" className="flex gap-6 relative overflow-x-auto border-t border-hairline px-4 text-sm font-medium text-steel md:hidden">
        <Link className="py-3 hover:text-ink" href="/products">Products</Link>
        <Link className="py-3 hover:text-ink" href="/gallery">Gallery</Link>
        <Link className="py-3 hover:text-ink" href="/#how-it-works">How it works</Link>
      </nav>
    </header>
  );
}

async function AccountArea() {
  const user = await getUser();
  if (!user) {
    return (
      <>
        <Link className="btn-quiet" href="/login">Sign in</Link>
        <Link className="btn-secondary hidden py-2 sm:inline-flex" href="/signup">Create account</Link>
      </>
    );
  }
  return (
    <>
      {user.role === "admin" && <Link className="btn-quiet" href="/admin">Job board</Link>}
      {/* On a phone, staff get the job board in the header instead of their name; three items do not fit. */}
      <Link className={user.role === "admin" ? "btn-quiet hidden sm:inline-flex" : "btn-quiet"} href="/account">{user.fullName.split(" ")[0] || "Account"}</Link>
      <form action={signOut}>
        <button className="btn-quiet" type="submit">Sign out</button>
      </form>
    </>
  );
}

/** Registration-mark logo: a crop-mark target, the printer's own symbol. */
function Mark() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden className="text-accent">
      <circle cx="11" cy="11" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M11 1v20M1 11h20" stroke="var(--color-ink)" strokeWidth="1.2" />
    </svg>
  );
}
