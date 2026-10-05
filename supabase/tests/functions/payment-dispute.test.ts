import { afterAll, describe, expect, it } from "vitest";
import { closePool, serviceClient, sql } from "../support/clients.ts";
import { awaitingEvent, insertPayment } from "../support/payments.ts";

// Contestarea plății (003: FR-016a; contracts/database-functions.md › register_dispute).
afterAll(closePool);

/** Eveniment activat printr-o plată, cu intenția de plată dată. */
async function paidEvent(prefix: string): Promise<{ eventId: string; paymentId: string; intent: string }> {
  const { eventId } = await awaitingEvent(prefix);
  const paymentId = await insertPayment({ eventId });
  const intent = `pi_test_${paymentId.replaceAll("-", "").slice(0, 16)}`;
  await sql("select public.activate_event($1, 'payment', null, $2, $3)", [eventId, `cs_ref_${paymentId}`, paymentId]);
  await sql("update public.payments set status = 'paid', paid_at = now(), stripe_payment_intent_id = $2 where id = $1", [paymentId, intent]);
  return { eventId, paymentId, intent };
}

async function dispute(intent: string) {
  return serviceClient().rpc("register_dispute", { p_payment_intent_id: intent });
}

async function noticeJobs(paymentId: string) {
  return sql(
    "select 1 from pgmq.q_media_jobs where message->>'type' = 'admin_payment_notice' and message->>'payment_id' = $1 and message->>'reason' = 'DISPUTE'",
    [paymentId],
  );
}

describe("register_dispute", () => {
  it("suspendă evenimentul activ, cu sursa „payment” și motivul, și anunță administratorii", async () => {
    const { eventId, paymentId, intent } = await paidEvent("dispute");
    const { data, error } = await dispute(intent);
    expect(error).toBeNull();
    expect(data).toEqual([{ outcome: "suspended", event_id: eventId }]);

    const [event] = await sql<{ status: string }>("select status::text from public.events where id = $1", [eventId]);
    expect(event?.status).toBe("suspended");
    const [change] = await sql<{ source: string; reason: string; external_ref: string }>(
      "select source::text, reason, external_ref from public.event_status_changes where event_id = $1 and to_status = 'suspended'",
      [eventId],
    );
    expect(change).toEqual({ source: "payment", reason: "Plată contestată", external_ref: intent });
    const [payment] = await sql<{ disputed: boolean; status: string }>(
      "select disputed_at is not null as disputed, status::text from public.payments where id = $1",
      [paymentId],
    );
    expect(payment).toEqual({ disputed: true, status: "paid" });
    expect(await noticeJobs(paymentId)).toHaveLength(1);
  });

  it("un eveniment deja suspendat rămâne neschimbat, dar emailul pleacă; a doua contestație e ignorată", async () => {
    const { eventId, paymentId, intent } = await paidEvent("dispute-twice");
    await dispute(intent);
    const again = await dispute(intent);
    expect(again.data).toEqual([{ outcome: "ignored", event_id: eventId }]);
    expect(await noticeJobs(paymentId)).toHaveLength(1);

    const other = await paidEvent("dispute-suspended");
    await sql("select public.transition_event($1, 'suspended', 'system', null, 'test')", [other.eventId]);
    expect((await dispute(other.intent)).data).toEqual([{ outcome: "unchanged", event_id: other.eventId }]);
    expect(await noticeJobs(other.paymentId)).toHaveLength(1);
  });

  it("o intenție necunoscută e ignorată; funcția e rezervată serverului", async () => {
    expect((await dispute("pi_necunoscut")).data).toEqual([{ outcome: "ignored", event_id: null }]);
    const { client } = await awaitingEvent("dispute-client");
    expect((await client.rpc("register_dispute", { p_payment_intent_id: "pi_x" })).error).not.toBeNull();
  });
});
