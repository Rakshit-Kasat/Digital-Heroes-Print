/**
 * Where Stripe sends the customer after paying. We do not trust the URL:
 * the session is fetched from Stripe with our secret key, and it must be
 * paid and belong to an order owned by the signed-in customer. Then
 * markPaid() runs (a no-op if the webhook got there first).
 */
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import { markPaid } from "@/lib/orders/service";
import { adminClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/pricing/calculate";

export const metadata: Metadata = { title: "Payment received", robots: { index: false } };

export default function SuccessPage(props: PageProps<"/checkout/success">) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
      <Suspense fallback={<p className="text-steel">Confirming your payment with Stripe…</p>}>
        <Confirm {...props} />
      </Suspense>
    </div>
  );
}

async function Confirm({ searchParams }: PageProps<"/checkout/success">) {
  const sessionId = String((await searchParams).session_id ?? "");
  const user = await requireUser("/account");
  if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId)) return <Problem text="This link is missing its payment reference." />;

  const session = await stripe().checkout.sessions.retrieve(sessionId).catch(() => null);
  const orderId = session?.metadata?.order_id;
  if (!session || !orderId) return <Problem text="We could not find that payment." />;

  const { data: order } = await adminClient().from("orders").select("id, number, customer_id, total_pence, currency").eq("id", orderId).single();
  if (!order || order.customer_id !== user.id) return <Problem text="We could not find that payment." />;
  if (session.payment_status !== "paid") return <Problem text="The payment has not completed yet. If you were charged, your order will update within a few minutes." />;

  try {
    await markPaid(order.id, { sessionId: session.id, paymentIntent: typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null });
  } catch (e) {
    // The payment is real; follow-up work (invoice, proof) is retried by the webhook.
    console.error("markPaid from success page failed", order.id, e);
  }

  return (
    <div>
      <p className="chip bg-success/10 text-success">Paid · {formatMoney(order.total_pence, order.currency)}</p>
      <h1 className="mt-4 text-4xl font-extrabold">Order {order.number} is confirmed</h1>
      <p className="mt-3 text-steel">
        Your invoice and a confirmation email are on their way. Your first proof is being prepared: check every name, number and colour, then approve it. Nothing is printed until you do.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link className="btn-primary" href={`/account/orders/${order.id}`}>Review your proof</Link>
        <Link className="btn-secondary" href="/account">Your account</Link>
      </div>
    </div>
  );
}

function Problem({ text }: { text: string }) {
  return (
    <div>
      <h1 className="text-3xl font-extrabold">Payment check</h1>
      <p className="mt-3 text-steel">{text}</p>
      <Link className="btn-secondary mt-6" href="/account">Go to your account</Link>
    </div>
  );
}
