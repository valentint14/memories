"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { serverEnv } from "../server-env";
import { createCheckoutSession, expireCheckoutSession } from "../stripe/checkout";
import { stripe } from "../stripe/client";
import { adminSupabase } from "../supabase/admin";
import { serverSupabase } from "../supabase/server";
import { ActionError, runAction, throwIfDbError, type ActionResult } from "./result";
import type { FormState } from "./self-service";

const startSchema = z.object({
  eventId: z.uuid(),
  purpose: z.enum(["activation", "retention_extension"]),
  optionId: z.uuid(),
  expectedAmountMinor: z.coerce.number().int().positive(),
});

/**
 * Pornește plata (003: FR-002, FR-007, FR-008; contracts/web-interface.md › startPayment): suma o
 * calculează baza de date, apoi se reia sesiunea deschisă sau se creează una nouă la Stripe.
 * Formular nativ: funcționează și fără JavaScript (CSP `form-action`, research R10).
 */
export async function startPaymentForm(_prev: FormState, formData: FormData): Promise<FormState> {
  let checkoutUrl = "";
  // Suma afișată pentru opțiunea aleasă vine din câmpul ascuns `amount_{optionId}` (formular fără JS).
  const optionId = formData.get("optionId");
  const fields = {
    ...Object.fromEntries(formData),
    expectedAmountMinor: typeof optionId === "string" ? formData.get(`amount_${optionId}`) : null,
  };
  const result = await runAction(startSchema, fields, async (input) => {
    const supabase = await serverSupabase();
    const { data, error } = await supabase.rpc("prepare_payment", {
      p_event_id: input.eventId,
      p_purpose: input.purpose,
      p_option_id: input.optionId,
      p_expected_amount_minor: input.expectedAmountMinor,
    });
    if (error?.message === "PRICE_CHANGED") revalidatePath(`/events/${input.eventId}`);
    throwIfDbError(error);
    const prepared = data?.[0];
    if (!prepared) throw new ActionError("INTERNAL");
    // Tipurile generate pentru `returns table` nu marchează coloanele nule.
    const reuseUrl = prepared.reuse_url as string | null;
    const replacedSessionId = prepared.replaced_session_id as string | null;
    if (reuseUrl !== null) {
      checkoutUrl = reuseUrl;
      return;
    }

    const admin = adminSupabase();
    const client = stripe();
    try {
      if (replacedSessionId !== null) await expireCheckoutSession(client, replacedSessionId);
      const { data: payment, error: readError } = await admin
        .from("payments")
        .select("event_name, organizer_email, retention_months, amount_minor, expires_at")
        .eq("id", prepared.payment_id)
        .single();
      throwIfDbError(readError);
      // O plată tocmai pregătită are mereu numele și emailul (se golesc doar la anonimizare).
      if (!payment || payment.organizer_email === null) throw new ActionError("INTERNAL");
      const session = await createCheckoutSession(client, {
        paymentId: prepared.payment_id,
        eventId: input.eventId,
        eventName: payment.event_name ?? "",
        organizerEmail: payment.organizer_email,
        purpose: input.purpose,
        retentionMonths: payment.retention_months,
        amountMinor: payment.amount_minor,
        expiresAt: payment.expires_at,
        appUrl: serverEnv.appUrl,
      });
      throwIfDbError(
        (await admin.rpc("attach_checkout_session", { p_payment_id: prepared.payment_id, p_session_id: session.id, p_checkout_url: session.url }))
          .error,
      );
      checkoutUrl = session.url;
    } catch (error) {
      // Procesatorul indisponibil: plata se închide, evenimentul rămâne neschimbat.
      await admin.rpc("expire_payment_by_id", { p_payment_id: prepared.payment_id });
      if (error instanceof ActionError) throw error;
      // Motivul (tipul, codul și mesajul erorii Stripe), fără chei sau date personale.
      const reason =
        error instanceof Error
          ? { error_type: "type" in error ? String(error.type) : error.name, error_code: "code" in error ? String(error.code) : undefined, error: error.message.slice(0, 300) }
          : {};
      console.error(JSON.stringify({ level: "error", scope: "stripe_checkout", msg: "checkout_create_failed", payment_id: prepared.payment_id, ...reason }));
      throw new ActionError("PAYMENT_UNAVAILABLE");
    }
  });
  if (!result.ok) return { status: "error", error: result.error };
  redirect(checkoutUrl);
}

export interface PaymentStateView {
  status: "open" | "paid" | "failed" | "expired" | "refund_due";
  purpose: "activation" | "retention_extension";
  paidAt: string | null;
}

/** Ultima plată a evenimentului, pentru „plata se confirmă” (FR-009). */
export async function paymentState(eventId: string): Promise<ActionResult<PaymentStateView | null>> {
  return runAction(z.uuid(), eventId, async (id) => {
    const supabase = await serverSupabase();
    const { data, error } = await supabase.rpc("organizer_payment_state", { p_event_id: id });
    throwIfDbError(error);
    const row = data?.[0];
    return row ? { status: row.status, purpose: row.purpose, paidAt: row.paid_at } : null;
  });
}
