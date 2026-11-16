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
    <header className="border-b border-hairline bg-paper/90 backdrop-blur supports-[backdrop-filter]:bg-paper/75 sticky top-0 z-30">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5 font-display text-[17px] font-extrabold tracking-tight">
          <Mark /> Digital Heroes <span className="font-medium text-steel">Print</span>
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-5 text-sm font-medium text-steel md:flex">
          <Link className="hover:text-ink" href="/products">Products</Link>
          <Link className="hover:text-ink" href="/gallery">Gallery</Link>
          <Link className="hover:text-ink" href="/#how-it-works">How it works</Link>
        </nav>
        <div className="ml-auto flex items-center gap-2 text-sm">
          <Suspense fallback={<span className="h-9 w-20" aria-hidden />}>
            <AccountArea />
          </Suspense>
        </div>
      </div>
      <nav aria-label="Main mobile" className="flex gap-6 overflow-x-auto border-t border-hairline px-4 text-sm font-medium text-steel md:hidden">
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
      <Link className="btn-quiet" href="/account">{user.fullName.split(" ")[0] || "Account"}</Link>
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
      <path d="M11 1v20M1 11h20" stroke="#1B1F24" strokeWidth="1.2" />
    </svg>
  );
}
