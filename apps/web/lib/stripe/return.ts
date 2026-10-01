import "server-only";
import type { Json } from "@memories/shared/db.types";
import { adminSupabase } from "../supabase/admin";
import { billingFromSession } from "./billing";
import { stripe } from "./client";

const SESSION_ID = /^cs_(test|live)_[A-Za-z0-9]{1,200}$/;

/**
 * Verificarea la întoarcerea din Checkout (003: FR-004; research R3): sesiunea se citește direct
 * din API-ul Stripe, cu cheia secretă; parametrul din URL singur nu activează nimic. Aceeași
 * finalizare idempotentă ca webhook-ul. Orice eșec lasă pagina să arate starea din baza de date.
 */
export async function confirmReturnedSession(eventId: string, sessionId: string): Promise<void> {
  if (!SESSION_ID.test(sessionId)) return;
  try {
    const session = await stripe().checkout.sessions.retrieve(sessionId);
    if (session.metadata?.event_id !== eventId || session.payment_status !== "paid") return;
    const intent = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
    if (intent === undefined) return;
    const { error } = await adminSupabase().rpc("complete_payment", {
      p_session_id: session.id,
      p_payment_intent_id: intent,
      p_billing: billingFromSession(session) as unknown as Json,
    });
    if (error) throw new Error(error.message);
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        scope: "stripe_return",
        msg: "return_confirmation_failed",
        error: error instanceof Error ? error.message.slice(0, 200) : "unknown",
      }),
    );
  }
}
