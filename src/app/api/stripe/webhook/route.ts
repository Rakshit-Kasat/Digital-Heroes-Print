/**
 * Stripe webhook: the source of truth for payment. The signature is checked
 * against the RAW body with the endpoint secret, so a forged request cannot
 * mark an order as paid. markPaid() is idempotent, so Stripe retries and the
 * success page racing this handler are both harmless.
 */
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { markPaid } from "@/lib/orders/service";

export const maxDuration = 60; // invoice + proof rendering on first delivery

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = req.headers.get("stripe-signature");
  if (!secret || !signature) return new Response("Webhook not configured", { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(await req.text(), signature, secret);
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const session = event.data.object;
    const orderId = session.metadata?.order_id;
    if (orderId && session.payment_status === "paid") {
      try {
        await markPaid(orderId, { sessionId: session.id, paymentIntent: typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null });
      } catch (e) {
        // 500 makes Stripe retry later; markPaid's claim step keeps that safe.
        console.error("markPaid failed", orderId, e);
        return new Response("Processing failed", { status: 500 });
      }
    }
  }
  return Response.json({ received: true });
}
