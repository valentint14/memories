import { createTestEvent, organizerClient, randomEmail, serviceClient, sql, type SupabaseClient } from "./clients.ts";

/** Ajutoare pentru testele de plăți (003). Rândurile se scriu ca `postgres`, ocolind RLS. */

export function inDays(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

export interface AwaitingEvent {
  client: SupabaseClient;
  email: string;
  eventId: string;
}

/** Organizator nou cu un eveniment în așteptarea activării (002/FR-005). */
export async function awaitingEvent(prefix: string, daysAhead = 20): Promise<AwaitingEvent> {
  const email = randomEmail(prefix);
  const client = await organizerClient(email);
  const { data, error } = await client.rpc("create_event_as_organizer", {
    p_name: "Nuntă de plătit",
    p_event_date: inDays(daysAhead),
    p_terms_version: "2026-10-05",
    p_privacy_version: "2026-10-05",
  });
  if (error) throw new Error(error.message);
  return { client, email, eventId: data };
}

export async function optionId(months: number): Promise<string> {
  const [row] = await sql<{ id: string }>("select id from public.retention_options where months = $1", [months]);
  if (!row) throw new Error(`Opțiunea de ${months} luni lipsește din seed`);
  return row.id;
}

/** Inserează direct o plată (pentru testele de constrângeri și de activare). */
export async function insertPayment(values: {
  eventId: string;
  purpose?: "activation" | "retention_extension";
  months?: number;
  basePriceMinor?: number;
  surchargeMinor?: number;
  status?: string;
  sessionId?: string;
}): Promise<string> {
  const months = values.months ?? 3;
  const base = values.basePriceMinor ?? 29_900;
  const surcharge = values.surchargeMinor ?? 0;
  const [row] = await sql<{ id: string }>(
    `insert into public.payments (event_id, event_name, organizer_email, purpose, retention_option_id,
       retention_months, base_price_minor, surcharge_minor, amount_minor, status, stripe_session_id, expires_at)
     select ev.id, coalesce(ev.name, ''), ev.organizer_email, $2::public.payment_purpose, $3::uuid, $4::int,
            $5::bigint, $6::bigint, $5::bigint + $6::bigint, $7::public.payment_status, $8, now() + interval '1 day'
       from public.events ev where ev.id = $1
     returning id`,
    [
      values.eventId,
      values.purpose ?? "activation",
      await optionId(months),
      months,
      base,
      surcharge,
      values.status ?? "open",
      values.sessionId ?? `cs_test_${crypto.randomUUID().replaceAll("-", "")}`,
    ],
  );
  if (!row) throw new Error("Plata nu a fost inserată");
  return row.id;
}

export interface PaidPayment {
  eventId: string;
  paymentId: string;
  paymentIntentId: string;
  amountMinor: number;
}

/** Eveniment activat printr-o plată reușită (004), ca în testele de contestație. */
export async function paidActivation(prefix: string): Promise<PaidPayment> {
  const { eventId } = await awaitingEvent(prefix);
  const paymentId = await insertPayment({ eventId });
  const paymentIntentId = `pi_test_${paymentId.replaceAll("-", "")}`;
  await sql("select public.activate_event($1, 'payment', null, $2, $3)", [eventId, `cs_ref_${paymentId}`, paymentId]);
  await sql("update public.payments set status = 'paid', paid_at = now(), stripe_payment_intent_id = $2 where id = $1", [
    paymentId,
    paymentIntentId,
  ]);
  return { eventId, paymentId, paymentIntentId, amountMinor: 29_900 };
}

/** Eveniment activ (`months` luni) prelungit la `toMonths` printr-o plată confirmată de `complete_payment`. */
export async function paidExtension(
  prefix: string,
  options: { months?: number; toMonths?: number; uploadStartsAt?: Date; uploadEndsAt?: Date } = {},
): Promise<PaidPayment> {
  const months = options.months ?? 3;
  const toMonths = options.toMonths ?? 12;
  const email = randomEmail(prefix);
  const client = await organizerClient(email);
  const event = await createTestEvent({
    organizerEmail: email,
    months,
    basePriceMinor: 29_900,
    ...(options.uploadStartsAt && { uploadStartsAt: options.uploadStartsAt }),
    ...(options.uploadEndsAt && { uploadEndsAt: options.uploadEndsAt }),
  });
  const [from, to] = await Promise.all([optionSurcharge(months), optionSurcharge(toMonths)]);
  const { data, error } = await client.rpc("prepare_payment", {
    p_event_id: event.id,
    p_purpose: "retention_extension",
    p_option_id: await optionId(toMonths),
    p_expected_amount_minor: to - from,
  });
  if (error) throw new Error(error.message);
  const paymentId = data[0]?.payment_id ?? "";
  const sessionId = `cs_test_${paymentId.replaceAll("-", "")}`;
  const paymentIntentId = `pi_test_${paymentId.replaceAll("-", "")}`;
  const service = serviceClient();
  const attached = await service.rpc("attach_checkout_session", {
    p_payment_id: paymentId,
    p_session_id: sessionId,
    p_checkout_url: `https://checkout.stripe.com/c/pay/${sessionId}`,
  });
  if (attached.error) throw new Error(attached.error.message);
  const done = await service.rpc("complete_payment", { p_session_id: sessionId, p_payment_intent_id: paymentIntentId, p_billing: {} });
  if (done.error) throw new Error(done.error.message);
  if (done.data[0]?.outcome !== "extended") throw new Error(`Prelungirea nu s-a aplicat: ${done.data[0]?.outcome ?? "?"}`);
  return { eventId: event.id, paymentId, paymentIntentId, amountMinor: to - from };
}

async function optionSurcharge(months: number): Promise<number> {
  const [row] = await sql<{ surcharge_minor: string }>("select surcharge_minor from public.retention_options where months = $1", [months]);
  return Number(row?.surcharge_minor);
}
