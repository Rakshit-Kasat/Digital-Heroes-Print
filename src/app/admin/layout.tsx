/**
 * Production console frame. The navigation is static; every page checks
 * requireAdmin() itself inside its <Suspense> body, and RLS backs that up
 * in the database, so the layout holds no secrets.
 */
import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminNav, NavLinks } from "./admin-nav";

export const metadata: Metadata = { title: { template: "%s | Production", default: "Production" }, robots: { index: false } };

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <Suspense fallback={<NavLinks path={null} />}>
        <AdminNav />
      </Suspense>
      {children}
    </div>
  );
}
