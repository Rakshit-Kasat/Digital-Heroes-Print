/**
 * Data Access Layer for identity. Every page and action asks HERE who the
 * user is; nothing trusts a role sent from the browser. The role is read
 * from the profiles table, which customers cannot change (DB trigger guard).
 */
import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { serverClient } from "@/lib/supabase/server";

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  company: string | null;
  role: "customer" | "admin";
}

/** Cached per request: many components can call it for one auth round-trip. */
export const getUser = cache(async (): Promise<SessionUser | null> => {
  // Who is asking is per-request by definition: tell Next before Supabase
  // reads the clock to check token expiry (Cache Components rule).
  await connection();
  const supabase = await serverClient();
  // getUser() validates the JWT with Supabase Auth (getSession() would trust the cookie blindly).
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const { data: p } = await supabase.from("profiles").select("full_name, company, role, email").eq("id", data.user.id).single();
  return {
    id: data.user.id,
    email: p?.email ?? data.user.email ?? "",
    fullName: p?.full_name ?? "",
    company: p?.company ?? null,
    role: p?.role === "admin" ? "admin" : "customer",
  };
});

export async function requireUser(next = "/account"): Promise<SessionUser> {
  const user = await getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser("/admin");
  if (user.role !== "admin") redirect("/account?denied=admin");
  return user;
}
