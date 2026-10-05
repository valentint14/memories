import type { Json } from "@memories/shared/db.types";
import { adminSupabase } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/server-env";
import { stripe } from "@/lib/stripe/client";
import { handleWebhookRequest, type WebhookDb } from "@/lib/stripe/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Operațiile webhook-ului, cu cheia service role (contracts/database-functions.md). */
function db(): WebhookDb {
  const supabase = adminSupabase();
  const must = <T>(result: { data: T; error: { message: string } | null }): T => {
    if (result.error) throw new Error(result.error.message);
    return result.data;
  };
  return {
    recordEvent: async (id, type) => must(await supabase.rpc("record_webhook_event", { p_id: id, p_type: type })) === true,
    finishEvent: async (id, outcome) => {
      must(await supabase.rpc("finish_webhook_event", { p_id: id, p_outcome: outcome }));
    },
    completePayment: async (sessionId, paymentIntentId, billing) => {
      const rows = must(
        await supabase.rpc("complete_payment", {
          p_session_id: sessionId,
          p_payment_intent_id: paymentIntentId,
          p_billing: billing as unknown as Json,
        }),
      );
      return rows?.[0]?.outcome ?? "ignored";
    },
    failPayment: async (sessionId) => {
      must(await supabase.rpc("fail_payment", { p_session_id: sessionId }));
    },
    expirePayment: async (sessionId) => {
      must(await supabase.rpc("expire_payment", { p_session_id: sessionId }));
    },
    registerDispute: async (paymentIntentId) => {
      const rows = must(await supabase.rpc("register_dispute", { p_payment_intent_id: paymentIntentId }));
      return rows?.[0]?.outcome ?? "ignored";
    },
  };
}

/** Webhook-ul Stripe (003: contracts/stripe-webhooks.md). */
export async function POST(request: Request): Promise<Response> {
  return handleWebhookRequest(request, { secret: serverEnv.stripeWebhookSecret, stripe: stripe(), db: db() });
}
