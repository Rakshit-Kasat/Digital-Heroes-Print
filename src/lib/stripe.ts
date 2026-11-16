/** Stripe (test mode). Checkout is hosted by Stripe, so card data never touches our servers. */
import "server-only";
import Stripe from "stripe";

let client: Stripe | null = null;
export function stripe(): Stripe {
  client ??= new Stripe(process.env.STRIPE_SECRET_KEY!);
  return client;
}
