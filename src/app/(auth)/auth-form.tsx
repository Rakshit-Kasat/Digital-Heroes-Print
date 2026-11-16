"use client";
import Link from "next/link";
import { useActionState } from "react";
import { signIn, signUp, type AuthState } from "./actions";

export function AuthForm({ mode, next }: { mode: "login" | "signup"; next: string }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(mode === "login" ? signIn : signUp, {});
  const v = state.values ?? {};
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next} />
      {mode === "signup" && (
        <>
          <div>
            <label className="label" htmlFor="fullName">Your name</label>
            <input className="field" id="fullName" name="fullName" autoComplete="name" defaultValue={v.fullName} required />
          </div>
          <div>
            <label className="label" htmlFor="company">Company or club <span className="font-normal text-steel">(optional)</span></label>
            <input className="field" id="company" name="company" autoComplete="organization" defaultValue={v.company} />
          </div>
        </>
      )}
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input className="field" id="email" name="email" type="email" autoComplete="email" defaultValue={v.email} required />
      </div>
      <div>
        <label className="label" htmlFor="password">Password</label>
        <input className="field" id="password" name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={mode === "signup" ? 8 : undefined} required />
        {mode === "signup" && <p className="mt-1 text-xs text-steel">At least 8 characters.</p>}
      </div>
      {state.error && <p role="alert" className="rounded-md bg-danger/8 px-3 py-2 text-sm text-danger">{state.error}</p>}
      <button className="btn-primary w-full" disabled={pending}>{pending ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}</button>
      <p className="text-sm text-steel">
        {mode === "login" ? <>New here? <Link className="link" href={`/signup?next=${encodeURIComponent(next)}`}>Create an account</Link></> : <>Already have an account? <Link className="link" href={`/login?next=${encodeURIComponent(next)}`}>Sign in</Link></>}
      </p>
    </form>
  );
}
