/**
 * Stripe Checkout for an order that already exists in "quote" status.
 * Shared by the designer's "Pay" button and one-click reorder, so both
 * charge exactly the server-calculated amount, in GBP, with VAT shown as
 * its own line (it matches the invoice line for line).
 */
import "server-only";
import { stripe } from "@/lib/stripe";
import { formatMoney, type PriceBreakdown } from "@/lib/pricing/calculate";

interface Args {
  order: { id: string; number: string };
  item: { quantity: number };
  product: { name: string };
  price: PriceBreakdown;
  email: string;
  cancelPath: string; // where "back" on the Stripe page returns to
}

export async function startCheckout({ order, item, product, price, email, cancelPath }: Args): Promise<string> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const meta = { order_id: order.id, order_number: order.number };
  const session = await stripe().checkout.sessions.create({
    mode: "payment",
    customer_email: email,
    client_reference_id: order.id,
    metadata: meta,
    payment_intent_data: { metadata: meta },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "gbp",
          unit_amount: price.subtotalPence,
          product_data: {
            name: `${product.name} × ${Number(item.quantity).toLocaleString("en-GB")}`,
            description: `Order ${order.number} · ${formatMoney(price.unitPence, "GBP", true)} each${price.setupPence ? " + setup" : ""} · ex VAT`,
          },
        },
      },
      { quantity: 1, price_data: { currency: "gbp", unit_amount: price.vatPence, product_data: { name: `VAT at ${Math.round(price.vatRate * 100)}%` } } },
    ],
    success_url: `${appUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}${cancelPath}`,
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60, // 1 hour
    // Charge in GBP only, so the card statement matches the VAT invoice.
    adaptive_pricing: { enabled: false },
  });
  if (!session.url) throw new Error("Checkout could not start.");
  return session.url;
}
