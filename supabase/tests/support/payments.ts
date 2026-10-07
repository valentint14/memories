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

const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** Inserează direct un cod de reducere (005), ca `postgres`; întoarce id-ul și textul codului. */
export async function discountCode(opts: {
  kind?: "personal" | "campaign";
  type?: "fixed" | "percent";
  value?: number;
  maxUses?: number;
  expiresAt?: Date | null;
  disabled?: boolean;
} = {}): Promise<{ id: string; code: string }> {
  const code = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
  const kind = opts.kind ?? "personal";
  const [row] = await sql<{ id: string }>(
    `insert into public.discount_codes (code, kind, discount_type, discount_value, max_uses, expires_at, disabled_at, batch_id)
     values ($1, $2::public.discount_kind, $3::public.discount_type, $4::bigint, $5::int, $6::timestamptz,
             case when $7::boolean then now() end, gen_random_uuid())
     returning id`,
    [code, kind, opts.type ?? "fixed", opts.value ?? 5_000, opts.maxUses ?? (kind === "personal" ? 1 : 10), opts.expiresAt ?? null, opts.disabled ?? false],
  );
  if (!row) throw new Error("Codul nu a fost inserat");
  return { id: row.id, code };
}

/** `discount_quote` ca serverul (005): emailul organizatorului evenimentului, o adresă IP proprie testului. */
export async function quoteAsServer(eventId: string, code: string) {
  const [event] = await sql<{ organizer_email: string }>("select organizer_email::text from public.events where id = $1", [eventId]);
  return serviceClient().rpc("discount_quote", {
    p_event_id: eventId,
    p_code: code,
    p_email: event?.organizer_email ?? "",
    p_ip_hash: `ip-${crypto.randomUUID()}`,
    p_ip_limit: 30,
  });
}

/** Aplică codul (`discount_quote`, ca butonul „Aplică”) și întoarce suma redusă a opțiunii. */
async function quotedAmount(_client: SupabaseClient, eventId: string, months: number, code: string): Promise<number> {
  const quote = await quoteAsServer(eventId, code);
  return quote.data?.find((o) => o.months === months)?.amount_minor ?? 0;
}

/** `prepare_payment` pentru activare cu un cod de reducere; suma așteptată implicită: cea din `discount_quote`. */
export async function prepareWithCode(client: SupabaseClient, eventId: string, months: number, code: string, expected?: number) {
  let amount = expected;
  if (amount === undefined) {
    amount = await quotedAmount(client, eventId, months, code);
  } else {
    await quotedAmount(client, eventId, months, code);
  }
  return client.rpc("prepare_payment", {
    p_event_id: eventId,
    p_purpose: "activation",
    p_option_id: await optionId(months),
    p_expected_amount_minor: amount,
    p_discount_code: code,
  });
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
