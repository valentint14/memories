import { afterAll, describe, expect, it } from "vitest";
import { adminClient, anonClient, closePool, sql } from "../support/clients.ts";
import { awaitingEvent, insertPayment } from "../support/payments.ts";

// Plățile și jurnalul webhook-urilor (003: data-model.md, FR-007, FR-011, FR-017, FR-018).
afterAll(closePool);

describe("RLS pe payments și stripe_webhook_events", () => {
  it("organizatorul și anon nu citesc și nu scriu direct", async () => {
    const { client, eventId } = await awaitingEvent("pay-rls");
    await insertPayment({ eventId });
    for (const c of [anonClient(), client]) {
      const read = await c.from("payments").select("id").eq("event_id", eventId);
      expect(read.data ?? []).toEqual([]);
      const write = await c.from("payments").update({ status: "paid" }).eq("event_id", eventId).select("id");
      expect(write.data ?? []).toEqual([]);
      const log = await c.from("stripe_webhook_events").select("id").limit(1);
      expect(log.data ?? []).toEqual([]);
    }
  });

  it("administratorul aal2 citește plățile", async () => {
    const { eventId } = await awaitingEvent("pay-admin");
    const paymentId = await insertPayment({ eventId });
    const { client: admin } = await adminClient({ aal2: true });
    const { data, error } = await admin.from("payments").select("id").eq("id", paymentId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });
});

describe("constrângerile plății", () => {
  it("cel mult o plată deschisă per eveniment și scop (FR-007)", async () => {
    const { eventId } = await awaitingEvent("pay-open");
    await insertPayment({ eventId });
    await expect(insertPayment({ eventId })).rejects.toThrow(/payments_one_open/);
    // O plată deschisă pentru alt scop rămâne posibilă.
    await expect(insertPayment({ eventId, purpose: "retention_extension", months: 12, surchargeMinor: 9_900 })).resolves.toBeTruthy();
  });

  it("cel mult o activare plătită per eveniment (FR-011)", async () => {
    const { eventId } = await awaitingEvent("pay-paid");
    const first = await insertPayment({ eventId, status: "expired" });
    const second = await insertPayment({ eventId, status: "expired" });
    for (const id of [first, second]) {
      await sql("update public.payments set paid_at = now(), stripe_payment_intent_id = $2 where id = $1", [id, `pi_${id.slice(0, 8)}`]);
    }
    await sql("update public.payments set status = 'paid' where id = $1", [first]);
    await expect(sql("update public.payments set status = 'paid' where id = $1", [second])).rejects.toThrow(/payments_one_paid_activation/);
  });

  it("verifică stările, moneda și suma", async () => {
    const { eventId } = await awaitingEvent("pay-checks");
    const id = await insertPayment({ eventId, status: "expired" });
    await expect(sql("update public.payments set status = 'paid' where id = $1", [id])).rejects.toThrow(/payments_paid_complete/);
    await sql("update public.payments set paid_at = now(), stripe_payment_intent_id = $2 where id = $1", [id, `pi_${id.slice(0, 8)}`]);
    await expect(sql("update public.payments set status = 'refund_due' where id = $1", [id])).rejects.toThrow(/payments_refund_reason/);
    await expect(sql("update public.payments set currency = 'eur' where id = $1", [id])).rejects.toThrow(/payments_currency/);
    await expect(sql("update public.payments set amount_minor = 0 where id = $1", [id])).rejects.toThrow(/payments_amount/);
  });

  it("plata rămâne după ștergerea evenimentului, fără legătura la el (FR-018)", async () => {
    const { eventId } = await awaitingEvent("pay-delete");
    const id = await insertPayment({ eventId, status: "expired" });
    await sql("delete from public.events where id = $1", [eventId]);
    const [row] = await sql<{ event_id: string | null; event_name: string }>(
      "select event_id, event_name from public.payments where id = $1",
      [id],
    );
    expect(row?.event_id).toBeNull();
    expect(row?.event_name).toBe("Nuntă de plătit");
  });
});
