import { afterAll, describe, expect, it } from "vitest";
import { closePool, createTestEvent, randomEmail, sql } from "../support/clients.ts";
import { awaitingEvent, insertPayment } from "../support/payments.ts";

// Păstrarea datelor de plată (003: FR-018; data-model.md › Retenție).
afterAll(closePool);

const YEAR = 365 * 86_400_000;

describe("anonimizarea plăților odată cu evenimentul (001/FR-047)", () => {
  it("golește numele, emailul și facturarea; suma, data și referințele rămân", async () => {
    const event = await createTestEvent({ organizerEmail: randomEmail("pay-anon") });
    const paymentId = await insertPayment({ eventId: event.id, status: "expired" });
    await sql(
      `update public.payments set billing_name = 'Ana Pop', billing_company = 'Ana SRL', billing_tax_id = 'RO1',
              billing_address = '{"city":"Cluj"}', stripe_payment_intent_id = 'pi_anon_' || id where id = $1`,
      [paymentId],
    );
    await sql("update public.events set status = 'expired', expired_at = $2 where id = $1", [event.id, new Date(Date.now() - 3 * YEAR - 5 * 86_400_000)]);

    await sql("select public.anonymize_expired_events(now())");

    const [row] = await sql<Record<string, unknown>>(
      `select event_name, organizer_email, billing_name, billing_company, billing_tax_id, billing_address,
              amount_minor, stripe_payment_intent_id is not null as has_ref
         from public.payments where id = $1`,
      [paymentId],
    );
    expect(row).toMatchObject({
      event_name: null,
      organizer_email: null,
      billing_name: null,
      billing_company: null,
      billing_tax_id: null,
      billing_address: null,
      amount_minor: "29900",
      has_ref: true,
    });
  });
});

describe("purge_payment_noise", () => {
  it("șterge plățile neterminate fără eveniment și jurnalul webhook-urilor mai vechi de 90 de zile", async () => {
    const { eventId } = await awaitingEvent("pay-noise");
    const stale = await insertPayment({ eventId, status: "expired" });
    const kept = await insertPayment({ eventId, status: "failed" });
    await sql("delete from public.events where id = $1", [eventId]);
    await sql("update public.payments set created_at = now() - interval '91 days' where id = $1", [stale]);
    await sql("insert into public.stripe_webhook_events (id, type, received_at) values ('evt_old_' || gen_random_uuid(), 'x', now() - interval '91 days')");

    await sql("select public.purge_payment_noise()");

    expect(await sql("select 1 from public.payments where id = $1", [stale])).toHaveLength(0);
    expect(await sql("select 1 from public.payments where id = $1", [kept])).toHaveLength(1);
    expect(await sql("select 1 from public.stripe_webhook_events where received_at < now() - interval '90 days'")).toHaveLength(0);
  });
});
