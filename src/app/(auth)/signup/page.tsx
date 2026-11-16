import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Create an account" };

export default function SignupPage({ searchParams }: PageProps<"/signup">) {
  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="text-3xl font-extrabold">Create an account</h1>
      <p className="mt-2 text-steel">Save designs, approve proofs and reorder in one click.</p>
      <div className="panel mt-8 p-6">
        <Suspense>
          <Form searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}

async function Form({ searchParams }: { searchParams: PageProps<"/signup">["searchParams"] }) {
  const { next } = await searchParams;
  return <AuthForm mode="signup" next={typeof next === "string" ? next : "/account"} />;
}
