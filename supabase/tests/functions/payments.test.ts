import { afterAll, describe, expect, it } from "vitest";
import { closePool, createTestEvent, organizerClient, randomEmail, serviceClient, sql, type SupabaseClient } from "../support/clients.ts";
import { awaitingEvent, optionId } from "../support/payments.ts";

// Plata activării (003: FR-001–FR-012a; contracts/database-functions.md).
afterAll(closePool);

async function packagePrice(): Promise<number> {
  const [row] = await sql<{ price_minor: string }>("select price_minor from public.packages where code = 'complete'");
  return Number(row?.price_minor);
}

async function surcharge(months: number): Promise<number> {
  const [row] = await sql<{ surcharge_minor: string }>("select surcharge_minor from public.retention_options where months = $1", [months]);
  return Number(row?.surcharge_minor);
}

async function prepare(client: SupabaseClient, eventId: string, months: number, expected?: number) {
  const amount = expected ?? (await packagePrice()) + (await surcharge(months));
  return client.rpc("prepare_payment", {
    p_event_id: eventId,
    p_purpose: "activation",
    p_option_id: await optionId(months),
    p_expected_amount_minor: amount,
  });
}

/** Pregătește și atașează o sesiune, ca Server Action-ul `startPayment`. */
async function startedPayment(client: SupabaseClient, eventId: string, months = 3): Promise<{ paymentId: string; sessionId: string }> {
  const { data, error } = await prepare(client, eventId, months);
  if (error) throw new Error(error.message);
  const paymentId = data[0]?.payment_id ?? "";
  const sessionId = `cs_test_${paymentId.replaceAll("-", "")}`;
  const attached = await serviceClient().rpc("attach_checkout_session", {
    p_payment_id: paymentId,
    p_session_id: sessionId,
    p_checkout_url: `https://checkout.stripe.com/c/pay/${sessionId}`,
  });
  if (attached.error) throw new Error(attached.error.message);
  return { paymentId, sessionId };
}

const BILLING = {
  name: "Ana Pop",
  address: { line1: "Str. Florilor 1", line2: null, city: "Cluj-Napoca", postal_code: "400000", state: "CJ", country: "RO" },
  company: "Ana SRL",
  tax_id: "RO12345678",
};

async function complete(sessionId: string, intent = `pi_${sessionId.slice(-12)}`) {
  return serviceClient().rpc("complete_payment", { p_session_id: sessionId, p_payment_intent_id: intent, p_billing: BILLING });
}

describe("prepare_payment (activare)", () => {
  it("calculează suma = pachetul + suplimentul opțiunii și o îngheață în plată", async () => {
    const { client, eventId } = await awaitingEvent("prep-amount");
    const expected = (await packagePrice()) + (await surcharge(12));
    const { data, error } = await prepare(client, eventId, 12);
    expect(error).toBeNull();
    expect(Number(data?.[0]?.amount_minor)).toBe(expected);
    const [row] = await sql<{ status: string; retention_months: number; amount_minor: string; currency: string }>(
      "select status::text, retention_months, amount_minor, currency from public.payments where id = $1",
      [data?.[0]?.payment_id],
    );
    expect(row).toEqual({ status: "open", retention_months: 12, amount_minor: String(expected), currency: "ron" });
  });

  it("refuză o sumă așteptată diferită cu PRICE_CHANGED și suma nouă", async () => {
    const { client, eventId } = await awaitingEvent("prep-price");
    const { error } = await prepare(client, eventId, 3, 1);
    expect(error?.message).toBe("PRICE_CHANGED");
    expect(error?.details).toContain("amountMinor");
  });

  it("e permisă doar proprietarului și doar în așteptarea activării", async () => {
    const { eventId } = await awaitingEvent("prep-owner");
    const other = await organizerClient(randomEmail("prep-other"));
    expect((await prepare(other, eventId, 3)).error?.message).toBe("PAYMENT_NOT_ALLOWED");
  });

  it("refuză o opțiune inactivă", async () => {
    const { client, eventId } = await awaitingEvent("prep-inactive");
    const id = await optionId(12);
    await sql("update public.retention_options set active = false where id = $1", [id]);
    try {
      expect((await prepare(client, eventId, 12)).error?.message).toBe("OPTION_INACTIVE");
    } finally {
      await sql("update public.retention_options set active = true where id = $1", [id]);
    }
  });

  it("plata expiră în cel mult 24 h și cu cel puțin 1 h înainte de ștergerea automată (FR-008)", async () => {
    const { client, eventId } = await awaitingEvent("prep-expiry");
    await sql("update public.events set pending_purge_at = now() + interval '5 hours' where id = $1", [eventId]);
    const { data } = await prepare(client, eventId, 3);
    const expiresAt = new Date(data?.[0]?.expires_at ?? 0).getTime();
    expect(Math.abs(expiresAt - (Date.now() + 4 * 3_600_000))).toBeLessThan(60_000);

    const fresh = await awaitingEvent("prep-24h");
    const far = await prepare(fresh.client, fresh.eventId, 3);
    expect(new Date(far.data?.[0]?.expires_at ?? 0).getTime()).toBeLessThanOrEqual(Date.now() + 24 * 3_600_000 + 60_000);
  });

  it("sub 30 de minute de fereastră refuză cu PAYMENT_WINDOW_CLOSED", async () => {
    const { client, eventId } = await awaitingEvent("prep-closed");
    await sql("update public.events set pending_purge_at = now() + interval '80 minutes' where id = $1", [eventId]);
    expect((await prepare(client, eventId, 3)).error?.message).toBe("PAYMENT_WINDOW_CLOSED");
  });
});

describe("complete_payment (activare)", () => {
  it("activează evenimentul cu sursa „payment”, salvează facturarea și pune emailul în coadă", async () => {
    const { client, eventId } = await awaitingEvent("complete-ok");
    const { paymentId, sessionId } = await startedPayment(client, eventId, 12);
    const { data, error } = await complete(sessionId);
    expect(error).toBeNull();
    expect(data).toEqual([{ outcome: "activated", event_id: eventId }]);

    const [payment] = await sql<{ status: string; billing_name: string; billing_company: string; billing_tax_id: string; city: string; paid: boolean }>(
      `select status::text, billing_name, billing_company, billing_tax_id, billing_address->>'city' as city, paid_at is not null as paid
         from public.payments where id = $1`,
      [paymentId],
    );
    expect(payment).toEqual({ status: "paid", billing_name: "Ana Pop", billing_company: "Ana SRL", billing_tax_id: "RO12345678", city: "Cluj-Napoca", paid: true });
    const [event] = await sql<{ status: string; retention_months: number }>("select status::text, retention_months from public.events where id = $1", [eventId]);
    expect(event).toEqual({ status: "active", retention_months: 12 });
    const [change] = await sql<{ source: string; external_ref: string }>(
      "select source::text, external_ref from public.event_status_changes where event_id = $1 and to_status = 'active'",
      [eventId],
    );
    expect(change).toEqual({ source: "payment", external_ref: sessionId });
    const jobs = await sql("select 1 from pgmq.q_media_jobs where message->>'type' = 'payment_confirmation' and message->>'payment_id' = $1", [paymentId]);
    expect(jobs).toHaveLength(1);
  });

  it("e idempotentă: aceeași confirmare de două ori nu schimbă nimic și nu dublează emailul (FR-006)", async () => {
    const { client, eventId } = await awaitingEvent("complete-twice");
    const { paymentId, sessionId } = await startedPayment(client, eventId);
    expect((await complete(sessionId)).data?.[0]?.outcome).toBe("activated");
    const again = await complete(sessionId);
    expect(again.error).toBeNull();
    expect(again.data?.[0]?.outcome).toBe("activated");
    const changes = await sql("select 1 from public.event_status_changes where event_id = $1 and to_status = 'active'", [eventId]);
    expect(changes).toHaveLength(1);
    const jobs = await sql("select 1 from pgmq.q_media_jobs where message->>'type' = 'payment_confirmation' and message->>'payment_id' = $1", [paymentId]);
    expect(jobs).toHaveLength(1);
  });

  it("o sesiune necunoscută e ignorată", async () => {
    expect((await complete("cs_test_necunoscuta")).data).toEqual([{ outcome: "ignored", event_id: null }]);
  });

  it("e rezervată serverului", async () => {
    const { client, eventId } = await awaitingEvent("complete-client");
    const { sessionId } = await startedPayment(client, eventId);
    const { error } = await client.rpc("complete_payment", { p_session_id: sessionId, p_payment_intent_id: "pi_x", p_billing: BILLING });
    expect(error).not.toBeNull();
  });
});

describe("organizer_payment_state", () => {
  it("arată proprietarului ultima plată, fără sume", async () => {
    const { client, eventId } = await awaitingEvent("state-owner");
    const { sessionId } = await startedPayment(client, eventId);
    expect((await client.rpc("organizer_payment_state", { p_event_id: eventId })).data?.[0]?.status).toBe("open");
    await complete(sessionId);
    const { data } = await client.rpc("organizer_payment_state", { p_event_id: eventId });
    expect(data?.[0]).toMatchObject({ status: "paid", purpose: "activation" });
    expect(Object.keys(data?.[0] ?? {})).not.toContain("amount_minor");

    const other = await organizerClient(randomEmail("state-other"));
    expect((await other.rpc("organizer_payment_state", { p_event_id: eventId })).data ?? []).toEqual([]);
  });
});

describe("activation_quote (FR-001)", () => {
  it("listează opțiunile active cu prețul final, data ștergerii și opțiunea inclusă, doar proprietarului", async () => {
    const { client, eventId } = await awaitingEvent("quote");
    const { data, error } = await client.rpc("activation_quote", { p_event_id: eventId });
    expect(error).toBeNull();
    const price = await packagePrice();
    const twelve = data?.find((o) => o.months === 12);
    expect(Number(twelve?.amount_minor)).toBe(price + (await surcharge(12)));
    expect(data?.filter((o) => o.included)).toHaveLength(1);
    // Aceeași dată ca la activare: sfârșitul zilei de după eveniment + 12 luni.
    const [expected] = await sql<{ purge: Date }>(
      `select ((((ev.event_date + 2)::timestamp + interval '12 months')) at time zone 'Europe/Bucharest') as purge
         from public.events ev where ev.id = $1`,
      [eventId],
    );
    expect(new Date(twelve?.purge_at ?? 0).getTime()).toBe(expected?.purge.getTime());

    const other = await organizerClient(randomEmail("quote-other"));
    expect((await other.rpc("activation_quote", { p_event_id: eventId })).data ?? []).toEqual([]);
  });
});

describe("plăți deschise, eșuate și expirate (US2: FR-007, FR-008, FR-011)", () => {
  it("reia plata deschisă identică, fără rând nou", async () => {
    const { client, eventId } = await awaitingEvent("reuse");
    const first = await startedPayment(client, eventId);
    const { data } = await prepare(client, eventId, 3);
    expect(data?.[0]?.payment_id).toBe(first.paymentId);
    expect(data?.[0]?.reuse_url).toBe(`https://checkout.stripe.com/c/pay/${first.sessionId}`);
    expect(await sql("select 1 from public.payments where event_id = $1", [eventId])).toHaveLength(1);
  });

  it("altă opțiune sau o plată aproape expirată înlocuiesc plata deschisă", async () => {
    const { client, eventId } = await awaitingEvent("replace");
    const first = await startedPayment(client, eventId, 3);
    const { data } = await prepare(client, eventId, 12);
    expect(data?.[0]?.payment_id).not.toBe(first.paymentId);
    expect(data?.[0]?.replaced_session_id).toBe(first.sessionId);
    const [old] = await sql<{ status: string }>("select status::text from public.payments where id = $1", [first.paymentId]);
    expect(old?.status).toBe("expired");

    const second = data?.[0]?.payment_id ?? "";
    await serviceClient().rpc("attach_checkout_session", { p_payment_id: second, p_session_id: `cs_test_${second.slice(0, 8)}`, p_checkout_url: "https://checkout.stripe.com/c/pay/x" });
    await sql("update public.payments set expires_at = now() + interval '5 minutes' where id = $1", [second]);
    const third = await prepare(client, eventId, 12);
    expect(third.data?.[0]?.payment_id).not.toBe(second);
    expect(third.data?.[0]?.replaced_session_id).toBe(`cs_test_${second.slice(0, 8)}`);
  });

  it("fail_payment și expire_payment schimbă doar plățile deschise", async () => {
    const { client, eventId } = await awaitingEvent("fail");
    const { paymentId, sessionId } = await startedPayment(client, eventId);
    await serviceClient().rpc("fail_payment", { p_session_id: sessionId });
    await serviceClient().rpc("expire_payment", { p_session_id: sessionId });
    const [row] = await sql<{ status: string; checkout_url: string | null }>("select status::text, checkout_url from public.payments where id = $1", [paymentId]);
    expect(row).toEqual({ status: "failed", checkout_url: null });

    const other = await awaitingEvent("expire");
    const started = await startedPayment(other.client, other.eventId);
    await complete(started.sessionId);
    await serviceClient().rpc("expire_payment", { p_session_id: started.sessionId });
    const [paid] = await sql<{ status: string }>("select status::text from public.payments where id = $1", [started.paymentId]);
    expect(paid?.status).toBe("paid");
  });

  it("a doua plată reușită pentru același eveniment devine „de rambursat” și anunță adminul", async () => {
    const { client, eventId } = await awaitingEvent("duplicate");
    const first = await startedPayment(client, eventId, 3);
    const { data } = await prepare(client, eventId, 12);
    const second = data?.[0]?.payment_id ?? "";
    const secondSession = `cs_test_${second.replaceAll("-", "")}`;
    await serviceClient().rpc("attach_checkout_session", { p_payment_id: second, p_session_id: secondSession, p_checkout_url: "https://checkout.stripe.com/c/pay/y" });

    // Ambele sesiuni au fost plătite (prima chiar în timp ce era înlocuită).
    expect((await complete(secondSession)).data?.[0]?.outcome).toBe("activated");
    expect((await complete(first.sessionId)).data?.[0]?.outcome).toBe("refund_due");
    const [row] = await sql<{ status: string; refund_reason: string }>("select status::text, refund_reason from public.payments where id = $1", [first.paymentId]);
    expect(row).toEqual({ status: "refund_due", refund_reason: "DUPLICATE_PAYMENT" });
    const jobs = await sql(
      "select 1 from pgmq.q_media_jobs where message->>'type' = 'admin_payment_notice' and message->>'payment_id' = $1 and message->>'reason' = 'DUPLICATE_PAYMENT'",
      [first.paymentId],
    );
    expect(jobs).toHaveLength(1);
  });

  it("plata pentru un eveniment activat manual sau șters între timp devine „de rambursat”", async () => {
    const manual = await awaitingEvent("manual");
    const started = await startedPayment(manual.client, manual.eventId);
    // Activat între timp pe altă cale (aici: altă plată aplicată direct, ca `postgres`).
    const [other] = await sql<{ id: string }>(
      `insert into public.payments (event_id, event_name, organizer_email, purpose, retention_option_id, retention_months,
         base_price_minor, surcharge_minor, amount_minor, status, expires_at)
       select ev.id, ev.name, ev.organizer_email, 'activation', pk.retention_option_id, 3, pk.price_minor, 0, pk.price_minor, 'expired', now()
         from public.events ev, public.packages pk where ev.id = $1 and pk.code = 'complete' returning id`,
      [manual.eventId],
    );
    await sql("select public.activate_event($1, 'payment', null, 'manual-ref', $2)", [manual.eventId, other?.id]);
    expect((await complete(started.sessionId)).data?.[0]?.outcome).toBe("refund_due");
    const [manualRow] = await sql<{ refund_reason: string }>("select refund_reason from public.payments where id = $1", [started.paymentId]);
    expect(manualRow?.refund_reason).toBe("EVENT_NOT_AWAITING");

    const deleted = await awaitingEvent("deleted");
    const gone = await startedPayment(deleted.client, deleted.eventId);
    await sql("delete from public.events where id = $1", [deleted.eventId]);
    expect((await complete(gone.sessionId)).data?.[0]?.outcome).toBe("refund_due");
    const [goneRow] = await sql<{ refund_reason: string }>("select refund_reason from public.payments where id = $1", [gone.paymentId]);
    expect(goneRow?.refund_reason).toBe("EVENT_DELETED");
  });

  it("jobul de expirare închide plățile deschise rămase după termen", async () => {
    const { client, eventId } = await awaitingEvent("cron");
    const { paymentId } = await startedPayment(client, eventId);
    await sql("update public.payments set expires_at = now() - interval '2 hours' where id = $1", [paymentId]);
    await sql("select public.expire_stale_payments()");
    const [row] = await sql<{ status: string }>("select status::text from public.payments where id = $1", [paymentId]);
    expect(row?.status).toBe("expired");
  });
});

describe("prelungirea plătită (US4: FR-020–FR-022)", () => {
  async function activeEvent(prefix: string, months = 3) {
    const email = randomEmail(prefix);
    const client = await organizerClient(email);
    const event = await createTestEvent({ organizerEmail: email, months, basePriceMinor: 29_900 });
    return { client, event };
  }

  async function prepareExtension(client: SupabaseClient, eventId: string, months: number, expected: number) {
    return client.rpc("prepare_payment", {
      p_event_id: eventId,
      p_purpose: "retention_extension",
      p_option_id: await optionId(months),
      p_expected_amount_minor: expected,
    });
  }

  async function attach(paymentId: string): Promise<string> {
    const sessionId = `cs_test_${paymentId.replaceAll("-", "")}`;
    await serviceClient().rpc("attach_checkout_session", { p_payment_id: paymentId, p_session_id: sessionId, p_checkout_url: "https://checkout.stripe.com/c/pay/z" });
    return sessionId;
  }

  it("se plătește diferența; după confirmare se aplică opțiunea, data și istoricul cu autorul „payment”", async () => {
    const { client, event } = await activeEvent("ext-ok");
    const difference = (await surcharge(12)) - (await surcharge(3));
    const { data, error } = await prepareExtension(client, event.id, 12, difference);
    expect(error).toBeNull();
    expect(Number(data?.[0]?.amount_minor)).toBe(difference);
    const paymentId = data?.[0]?.payment_id ?? "";

    // Până la plată nu se schimbă nimic.
    const [before] = await sql<{ retention_months: number; purge_at: Date }>("select retention_months, purge_at from public.events where id = $1", [event.id]);
    expect(before?.retention_months).toBe(3);

    const sessionId = await attach(paymentId);
    expect((await complete(sessionId)).data?.[0]?.outcome).toBe("extended");
    const [after] = await sql<{ retention_months: number; final_price_minor: string; purge_at: Date }>(
      "select retention_months, final_price_minor, purge_at from public.events where id = $1",
      [event.id],
    );
    expect(after?.retention_months).toBe(12);
    expect(Number(after?.final_price_minor)).toBe(29_900 + (await surcharge(12)));
    expect(after?.purge_at.getTime()).toBeGreaterThan(before?.purge_at.getTime() ?? 0);
    const [log] = await sql<{ actor_kind: string; to_months: number }>(
      "select actor_kind::text, to_months from public.event_retention_changes where event_id = $1 order by id desc limit 1",
      [event.id],
    );
    expect(log).toEqual({ actor_kind: "payment", to_months: 12 });
    const jobs = await sql("select 1 from pgmq.q_media_jobs where message->>'type' = 'payment_confirmation' and message->>'payment_id' = $1", [paymentId]);
    expect(jobs).toHaveLength(1);
  });

  it("refuză o opțiune mai scurtă sau egală și un eveniment neactiv", async () => {
    const { client, event } = await activeEvent("ext-short", 6);
    expect((await prepareExtension(client, event.id, 6, 1)).error?.message).toBe("RETENTION_NOT_LONGER");
    const awaiting = await awaitingEvent("ext-awaiting");
    expect((await prepareExtension(awaiting.client, awaiting.eventId, 12, 1)).error?.message).toBe("PAYMENT_NOT_ALLOWED");
  });

  it("o plată pentru o prelungire devenită imposibilă ajunge la administrator", async () => {
    const { client, event } = await activeEvent("ext-late");
    const difference = (await surcharge(12)) - (await surcharge(3));
    const { data } = await prepareExtension(client, event.id, 12, difference);
    const paymentId = data?.[0]?.payment_id ?? "";
    const sessionId = await attach(paymentId);
    // Între timp, administratorul a trecut deja evenimentul pe 12 luni.
    await sql("update public.events set retention_option_id = $2 where id = $1", [event.id, await optionId(12)]);
    expect((await complete(sessionId)).data?.[0]?.outcome).toBe("refund_due");
    const [row] = await sql<{ refund_reason: string }>("select refund_reason from public.payments where id = $1", [paymentId]);
    expect(row?.refund_reason).toBe("EXTENSION_NOT_POSSIBLE");
  });
});

