import "server-only";
import type Stripe from "stripe";
import { billingFromSession, type Billing } from "./billing";

/** Corpul maxim acceptat (contracts/stripe-webhooks.md › Endpoint). */
export const MAX_WEBHOOK_BYTES = 1_048_576;

/** Operațiile din baza de date folosite de webhook (contracts/database-functions.md). */
export interface WebhookDb {
  /** false = evenimentul a fost deja procesat. */
  recordEvent: (id: string, type: string) => Promise<boolean>;
  finishEvent: (id: string, outcome: string) => Promise<void>;
  completePayment: (sessionId: string, paymentIntentId: string, billing: Billing) => Promise<string>;
  failPayment: (sessionId: string) => Promise<void>;
  expirePayment: (sessionId: string) => Promise<void>;
  registerDispute: (paymentIntentId: string) => Promise<string>;
}

export interface WebhookDeps {
  secret: string;
  stripe: Stripe;
  db: WebhookDb;
}

/** Jurnal fără date personale: doar identificatorul, tipul și rezultatul (FR-017, constituția II). */
function log(level: "info" | "warn" | "error", msg: string, fields: Record<string, string> = {}): void {
  const line = JSON.stringify({ level, service: "web", scope: "stripe_webhook", msg, ...fields });
  if (level === "error") console.error(line);
  else console.warn(line);
}

function paymentIntentId(value: string | Stripe.PaymentIntent | null): string | null {
  if (value === null) return null;
  return typeof value === "string" ? value : value.id;
}

/** Tratează un eveniment verificat și întoarce rezultatul de jurnalizat. */
export async function handleStripeEvent(event: Stripe.Event, db: WebhookDb): Promise<string> {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object;
      // Metodele întârziate trimit întâi `completed` cu `unpaid`; plata vine cu evenimentul următor.
      if (session.payment_status !== "paid" || session.metadata?.payment_id === undefined) return "ignored";
      const intent = paymentIntentId(session.payment_intent);
      if (intent === null) return "ignored";
      return db.completePayment(session.id, intent, billingFromSession(session));
    }
    case "checkout.session.async_payment_failed":
      await db.failPayment(event.data.object.id);
      return "failed";
    case "checkout.session.expired":
      await db.expirePayment(event.data.object.id);
      return "expired";
    case "charge.dispute.created": {
      const intent = paymentIntentId(event.data.object.payment_intent);
      if (intent === null) return "ignored";
      return db.registerDispute(intent);
    }
    default:
      return "ignored";
  }
}

/**
 * `POST /api/stripe/webhook` (contracts/stripe-webhooks.md): corp brut cu limită, semnătură
 * verificată, deduplicare, tratare, apoi marcarea ca procesat. Orice răspuns non-2xx face Stripe
 * să reîncerce.
 */
export async function handleWebhookRequest(request: Request, deps: WebhookDeps): Promise<Response> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_WEBHOOK_BYTES) return new Response(null, { status: 413 });
  const raw = await request.arrayBuffer();
  if (raw.byteLength > MAX_WEBHOOK_BYTES) return new Response(null, { status: 413 });

  const signature = request.headers.get("stripe-signature");
  let event: Stripe.Event;
  try {
    if (signature === null) throw new Error("semnătură lipsă");
    event = deps.stripe.webhooks.constructEvent(Buffer.from(raw), signature, deps.secret);
  } catch {
    log("warn", "webhook_signature_invalid");
    return new Response(null, { status: 400 });
  }

  try {
    if (!(await deps.db.recordEvent(event.id, event.type))) {
      return Response.json({ received: true, duplicate: true });
    }
    const outcome = await handleStripeEvent(event, deps.db);
    await deps.db.finishEvent(event.id, outcome);
    log("info", "webhook_processed", { event_id: event.id, type: event.type, outcome });
    return Response.json({ received: true });
  } catch (error) {
    log("error", "webhook_failed", {
      event_id: event.id,
      type: event.type,
      error: error instanceof Error ? error.message.slice(0, 200) : "unknown",
    });
    return new Response(null, { status: 500 });
  }
}
