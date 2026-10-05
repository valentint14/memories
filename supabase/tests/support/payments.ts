import { organizerClient, randomEmail, sql, type SupabaseClient } from "./clients.ts";

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
