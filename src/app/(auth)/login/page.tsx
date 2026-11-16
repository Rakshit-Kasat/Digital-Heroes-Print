import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="text-3xl font-extrabold">Sign in</h1>
      <p className="mt-2 text-steel">Pick up your saved designs, proofs and orders.</p>
      <div className="panel mt-8 p-6">
        <Suspense>
          <Form searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}

async function Form({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const { next } = await searchParams;
  return <AuthForm mode="login" next={typeof next === "string" ? next : "/account"} />;
}
