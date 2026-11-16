/**
 * User management (PRD §15 "admin panel: user management"). Admins can
 * promote or demote; the database refuses to remove the last admin, and an
 * admin cannot demote themselves (so nobody locks themselves out by mistake).
 */
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";
import { serverClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/pricing/calculate";
import { ActionForm } from "../forms";
import { setRole } from "../actions";

export const metadata: Metadata = { title: "Users" };
const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" , timeZone: "Europe/London" });

export default function UsersPage(props: PageProps<"/admin/users">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-lg bg-mist" aria-label="Loading users" />}>
      <Users searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Users({ searchParams }: Pick<PageProps<"/admin/users">, "searchParams">) {
  const me = await requireAdmin();
  const q = String((await searchParams).q ?? "").trim().slice(0, 80).replace(/[%,()*]/g, " ");
  const supabase = await serverClient();
  let query = supabase.from("profiles").select("id, email, full_name, company, role, created_at, orders(total_pence, paid_at)").order("created_at", { ascending: false }).limit(200);
  if (q) query = query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%,company.ilike.%${q}%`);
  const { data } = await query;
  const users = (data ?? []) as Array<{ id: string; email: string; full_name: string | null; company: string | null; role: "admin" | "customer"; created_at: string; orders: Array<{ total_pence: number; paid_at: string | null }> }>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-3xl font-extrabold">Users</h1>
        <form action="/admin/users" role="search" className="flex gap-2">
          <label className="sr-only" htmlFor="uq">Search users</label>
          <input id="uq" name="q" defaultValue={q} className="field w-64" placeholder="Name, email or company" />
          <button className="btn-secondary py-2">Search</button>
        </form>
      </div>
      <div className="panel overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-hairline text-left text-steel">
            <tr>
              <th className="px-4 py-2.5 font-medium">User</th>
              <th className="px-4 py-2.5 font-medium">Joined</th>
              <th className="px-4 py-2.5 text-right font-medium">Paid orders</th>
              <th className="px-4 py-2.5 text-right font-medium">Spent</th>
              <th className="px-4 py-2.5 font-medium">Role</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {users.map((u) => {
              const paid = u.orders.filter((o) => o.paid_at);
              return (
                <tr key={u.id}>
                  <td className="px-4 py-3">
                    <span className="block font-medium">{u.full_name || "No name"}{u.id === me.id ? " (you)" : ""}</span>
                    <span className="block text-xs text-steel">{u.email}{u.company ? `, ${u.company}` : ""}</span>
                  </td>
                  <td className="px-4 py-3 text-steel">{day.format(new Date(u.created_at))}</td>
                  <td className="px-4 py-3 text-right">{paid.length ? <Link className="link" href={`/admin?q=${encodeURIComponent(u.email)}`}>{paid.length}</Link> : 0}</td>
                  <td className="px-4 py-3 text-right">{formatMoney(paid.reduce((a, o) => a + o.total_pence, 0))}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className={`chip ${u.role === "admin" ? "bg-accent/10 text-accent-ink" : "bg-mist text-steel"}`}>{u.role === "admin" ? "Admin" : "Customer"}</span>
                      {u.id !== me.id && (
                        <ActionForm action={setRole} tone="quiet" submit={u.role === "admin" ? "Make customer" : "Make admin"} confirm={u.role === "admin" ? "Confirm: remove admin" : "Confirm: give admin access"}>
                          <input type="hidden" name="userId" value={u.id} />
                          <input type="hidden" name="role" value={u.role === "admin" ? "customer" : "admin"} />
                        </ActionForm>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-steel">New accounts always start as customers. At least one admin must remain; the database enforces this.</p>
    </div>
  );
}
