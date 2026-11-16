"use server";
/**
 * Auth server actions. Sign-up creates the user with the Admin API
 * (email pre-confirmed) so reviewers can sign up and order immediately,
 * without waiting on confirmation mail — a deliberate trade-off noted in
 * docs/DECISIONS.md. Inputs are validated with zod on the server.
 */
import { redirect } from "next/navigation";
import { z } from "zod";
import { adminClient, serverClient } from "@/lib/supabase/server";

export interface AuthState { error?: string; values?: Record<string, string> }

/** Only allow same-site relative redirects (prevents open-redirects via ?next=). */
function safeNext(next: FormDataEntryValue | null): string {
  const s = typeof next === "string" ? next : "";
  return s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/\\") ? s : "/account";
}

const SignIn = z.object({ email: z.email("Enter a valid email address."), password: z.string().min(1, "Enter your password.") });

export async function signIn(_prev: AuthState, form: FormData): Promise<AuthState> {
  const parsed = SignIn.safeParse({ email: form.get("email"), password: form.get("password") });
  const values = { email: String(form.get("email") ?? "") };
  if (!parsed.success) return { error: parsed.error.issues[0].message, values };
  const supabase = await serverClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: "That email and password do not match an account.", values };
  redirect(safeNext(form.get("next")));
}

const SignUp = z.object({
  fullName: z.string().trim().min(2, "Enter your name.").max(120),
  company: z.string().trim().max(120).optional(),
  email: z.email("Enter a valid email address."),
  password: z.string().min(8, "Use at least 8 characters for your password.").max(72),
});

export async function signUp(_prev: AuthState, form: FormData): Promise<AuthState> {
  const raw = { fullName: String(form.get("fullName") ?? ""), company: String(form.get("company") ?? ""), email: String(form.get("email") ?? "").trim().toLowerCase(), password: String(form.get("password") ?? "") };
  const values = { fullName: raw.fullName, company: raw.company, email: raw.email };
  const parsed = SignUp.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0].message, values };

  const { data, error } = await adminClient().auth.admin.createUser({
    email: parsed.data.email, password: parsed.data.password, email_confirm: true,
    user_metadata: { full_name: parsed.data.fullName },
  });
  if (error) {
    const taken = /already|registered|exists/i.test(error.message);
    return { error: taken ? "An account with this email already exists. Sign in instead." : "We could not create the account. Please try again.", values };
  }
  // The DB trigger made the profile; fill in the details (role stays "customer").
  await adminClient().from("profiles").update({ full_name: parsed.data.fullName, company: parsed.data.company || null }).eq("id", data.user.id);

  const supabase = await serverClient();
  await supabase.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password });
  redirect(safeNext(form.get("next")));
}

export async function signOut() {
  const supabase = await serverClient();
  await supabase.auth.signOut();
  redirect("/");
}
