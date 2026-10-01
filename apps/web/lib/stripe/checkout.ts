import "server-only";
import type Stripe from "stripe";

/** Ce trimite aplicația la Stripe pentru o plată (contracts/stripe-webhooks.md › Crearea sesiunii). */
export interface CheckoutInput {
  paymentId: string;
  eventId: string;
  eventName: string;
  organizerEmail: string;
  purpose: "activation" | "retention_extension";
  retentionMonths: number;
  amountMinor: number;
  expiresAt: string;
  appUrl: string;
}

/** Parametrii sesiunii Checkout găzduite (003: FR-002, FR-003, FR-008, FR-012, FR-012a; research R1, R4). */
export function checkoutSessionParams(input: CheckoutInput): Stripe.Checkout.SessionCreateParams {
  const name =
    input.purpose === "activation"
      ? `Memories — pachet complet, ${String(input.retentionMonths)} luni`
      : `Memories — prelungirea păstrării la ${String(input.retentionMonths)} luni`;
  const metadata = { payment_id: input.paymentId, event_id: input.eventId, purpose: input.purpose };
  const eventUrl = new URL(`/events/${input.eventId}`, input.appUrl).toString();
  return {
    mode: "payment",
    // Platforma e vânzătorul și emite facturile (FR-012). Managed Payments (Stripe ca vânzător, activ
    // implicit pe unele conturi) ar cere coduri fiscale de produs și ar muta facturarea la Stripe.
    managed_payments: { enabled: false },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "ron",
          unit_amount: input.amountMinor,
          product_data: { name, description: input.eventName },
        },
      },
    ],
    customer_email: input.organizerEmail,
    billing_address_collection: "required",
    tax_id_collection: { enabled: true },
    payment_intent_data: { receipt_email: input.organizerEmail, metadata },
    metadata,
    expires_at: Math.floor(Date.parse(input.expiresAt) / 1000),
    locale: "ro",
    // `{CHECKOUT_SESSION_ID}` e completat de Stripe; nu se codifică.
    success_url: `${eventUrl}?plata={CHECKOUT_SESSION_ID}`,
    cancel_url: `${eventUrl}?plata=anulata`,
  };
}

/** Creează sesiunea; cheia de idempotență e plata, deci o reîncercare nu creează a doua sesiune. */
export async function createCheckoutSession(stripe: Stripe, input: CheckoutInput): Promise<{ id: string; url: string }> {
  const session = await stripe.checkout.sessions.create(checkoutSessionParams(input), {
    idempotencyKey: `checkout-${input.paymentId}`,
  });
  if (session.url === null) throw new Error("Stripe nu a întors URL-ul sesiunii");
  return { id: session.id, url: session.url };
}

/** Închide o sesiune înlocuită (R5). O sesiune deja închisă sau plătită nu e o eroare: webhook-ul o tratează. */
export async function expireCheckoutSession(stripe: Stripe, sessionId: string): Promise<void> {
  try {
    await stripe.checkout.sessions.expire(sessionId);
  } catch (error) {
    if (error instanceof Error && "type" in error && error.type === "StripeInvalidRequestError") return;
    throw error;
  }
}
