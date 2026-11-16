"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/admin", label: "Job board" },
  { href: "/admin/reports", label: "Reports" },
  { href: "/admin/products", label: "Products & prices" },
  { href: "/admin/users", label: "Users" },
];

/** Console tabs; the current section is marked for screen readers too. */
export function AdminNav() {
  return <NavLinks path={usePathname()} />;
}

/** Also the Suspense fallback (path unknown while prerendering: nothing marked). */
export function NavLinks({ path }: { path: string | null }) {
  return (
    <nav aria-label="Production console" className="mb-8 flex gap-1 relative overflow-x-auto overflow-y-hidden border-b border-hairline text-sm font-medium">
      {NAV.map((n) => {
        const active = !!path && (n.href === "/admin" ? path === "/admin" || path.startsWith("/admin/orders") : path.startsWith(n.href));
        return (
          <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 ${active ? "border-accent text-ink" : "border-transparent text-steel hover:text-ink"}`}>
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}
