import { afterAll, describe, expect, it } from "vitest";
import { closePool, serviceClient, sql } from "../support/clients.ts";
import { awaitingEvent, insertPayment, optionId, paidActivation, paidExtension } from "../support/payments.ts";

// Rambursările plăților (004: FR-001–FR-012; contracts/database-functions.md › register_refund).
afterAll(closePool);

async function refund(intent: string, refundedMinor: number, at = new Date()) {
  return serviceClient().rpc("register_refund", {
    p_payment_intent_id: intent,
    p_refunded_minor: refundedMinor,
    p_refunded_at: at.toISOString(),
  });
}

async function paymentRow(paymentId: string) {
  const [row] = await sql<{ refunded_minor: string; refunded_at: Date | null; refund_effect: string | null; status: string }>(
    "select refunded_minor, refunded_at, refund_effect, status::text from public.payments where id = $1",
    [paymentId],
  );
  return row;
}

async function eventStatus(eventId: string): Promise<string | undefined> {
  const [row] = await sql<{ status: string }>("select status::text from public.events where id = $1", [eventId]);
  return row?.status;
}

describe("register_refund: înregistrarea sumei (FR-001–FR-003)", () => {
  it("o intenție necunoscută e ignorată", async () => {
    expect((await refund("pi_necunoscut", 100)).data).toEqual([{ outcome: "ignored", event_id: null }]);
  });

  it("o rambursare parțială se înregistrează, cu suma și data", async () => {
    const paid = await paidActivation("refund-partial-sum");
    const at = new Date(Date.now() - 60_000);
    const { data, error } = await refund(paid.paymentIntentId, 5_000, at);
    expect(error).toBeNull();
    expect(data).toEqual([{ outcome: "partial", event_id: paid.eventId }]);
    const row = await paymentRow(paid.paymentId);
    expect(Number(row?.refunded_minor)).toBe(5_000);
    expect(row?.refunded_at?.getTime()).toBe(at.getTime());
    expect(row?.refund_effect).toBeNull();
  });

  it("repetarea sau o sumă mai mică după una mai mare e ignorată; suma nu scade", async () => {
    const paid = await paidActivation("refund-stale");
    await refund(paid.paymentIntentId, 8_000);
    expect((await refund(paid.paymentIntentId, 8_000)).data?.[0]?.outcome).toBe("ignored");
    expect((await refund(paid.paymentIntentId, 3_000)).data?.[0]?.outcome).toBe("ignored");
    expect(Number((await paymentRow(paid.paymentId))?.refunded_minor)).toBe(8_000);
  });

  it("o sumă peste plată se limitează la suma plătită; o sumă negativă e respinsă", async () => {
    const paid = await paidActivation("refund-cap");
    await refund(paid.paymentIntentId, paid.amountMinor + 1_000);
    expect(Number((await paymentRow(paid.paymentId))?.refunded_minor)).toBe(paid.amountMinor);

    const other = await paidActivation("refund-negative");
    const { error } = await refund(other.paymentIntentId, -1);
    expect(error?.message).toContain("VALIDATION");
  });

  it("rambursarea unei plăți „de rambursat” nu schimbă evenimentul (FR-011, SC-004)", async () => {
    const paid = await paidActivation("refund-due");
    const dupId = await insertPayment({ eventId: paid.eventId, status: "open" });
    const dupIntent = `pi_test_dup_${dupId.replaceAll("-", "").slice(0, 12)}`;
    await sql(
      "update public.payments set status = 'refund_due', refund_reason = 'DUPLICATE_PAYMENT', paid_at = now(), stripe_payment_intent_id = $2 where id = $1",
      [dupId, dupIntent],
    );
    expect((await refund(dupIntent, 29_900)).data).toEqual([{ outcome: "none", event_id: paid.eventId }]);
    expect(await eventStatus(paid.eventId)).toBe("active");
    expect(await paymentRow(dupId)).toMatchObject({ refunded_minor: "29900", refund_effect: "none", status: "refund_due" });
  });

  it("funcția e rezervată serverului", async () => {
    const { client } = await awaitingEvent("refund-client");
    const { error } = await client.rpc("register_refund", { p_payment_intent_id: "pi_x", p_refunded_minor: 1, p_refunded_at: new Date().toISOString() });
    expect(error).not.toBeNull();
  });
});

describe("register_refund: plata activării (US1: FR-004–FR-006)", () => {
  async function suspensions(eventId: string) {
    return sql<{ source: string; reason: string; external_ref: string }>(
      "select source::text, reason, external_ref from public.event_status_changes where event_id = $1 and to_status = 'suspended' order by created_at",
      [eventId],
    );
  }

  it("rambursarea integrală suspendă evenimentul activ, cu sursa „payment”, motivul și referința", async () => {
    const paid = await paidActivation("refund-full");
    const { data, error } = await refund(paid.paymentIntentId, paid.amountMinor);
    expect(error).toBeNull();
    expect(data).toEqual([{ outcome: "suspended", event_id: paid.eventId }]);
    expect(await eventStatus(paid.eventId)).toBe("suspended");
    expect(await suspensions(paid.eventId)).toEqual([{ source: "payment", reason: "Plată rambursată", external_ref: paid.paymentIntentId }]);
    expect((await paymentRow(paid.paymentId))?.refund_effect).toBe("suspended");
  });

  it("o rambursare parțială lasă evenimentul activ; parțialele care completează suma îl suspendă", async () => {
    const paid = await paidActivation("refund-two-partials");
    expect((await refund(paid.paymentIntentId, 10_000)).data?.[0]?.outcome).toBe("partial");
    expect(await eventStatus(paid.eventId)).toBe("active");
    expect((await refund(paid.paymentIntentId, paid.amountMinor)).data?.[0]?.outcome).toBe("suspended");
    expect(await eventStatus(paid.eventId)).toBe("suspended");
  });

  it("după reactivarea manuală, un nou anunț al aceleiași rambursări nu mai suspendă (FR-006)", async () => {
    const paid = await paidActivation("refund-reactivated");
    await refund(paid.paymentIntentId, paid.amountMinor);
    await sql("select public.transition_event($1, 'active', 'admin', null, 'rambursare de bunăvoință')", [paid.eventId]);
    expect((await refund(paid.paymentIntentId, paid.amountMinor)).data?.[0]?.outcome).toBe("ignored");
    expect(await eventStatus(paid.eventId)).toBe("active");
    expect(await suspensions(paid.eventId)).toHaveLength(1);
  });

  it("un eveniment deja suspendat (de ex. la contestație) nu primește a doua suspendare", async () => {
    const paid = await paidActivation("refund-disputed");
    await serviceClient().rpc("register_dispute", { p_payment_intent_id: paid.paymentIntentId });
    expect((await refund(paid.paymentIntentId, paid.amountMinor)).data?.[0]?.outcome).toBe("none");
    expect(await suspensions(paid.eventId)).toHaveLength(1);
  });

  it("evenimentul șters între timp: plata se marchează rambursată, fără efect", async () => {
    const paid = await paidActivation("refund-deleted");
    await sql("delete from public.events where id = $1", [paid.eventId]);
    expect((await refund(paid.paymentIntentId, paid.amountMinor)).data).toEqual([{ outcome: "none", event_id: null }]);
    expect((await paymentRow(paid.paymentId))?.refund_effect).toBe("none");
  });
});

describe("register_refund: plata prelungirii (US2: FR-007–FR-010)", () => {
  const DAY = 86_400_000;

  async function retention(eventId: string) {
    const [row] = await sql<{ months: number; final: string; purge_at: Date }>(
      "select retention_months as months, final_price_minor as final, purge_at from public.events where id = $1",
      [eventId],
    );
    return row;
  }

  async function manualNotices(paymentId: string) {
    return sql(
      "select 1 from pgmq.q_media_jobs where message->>'type' = 'admin_payment_notice' and message->>'payment_id' = $1 and message->>'reason' = 'RETENTION_MANUAL'",
      [paymentId],
    );
  }

  /** Păstrarea de dinaintea prelungirii, din istoric (rândul anterior celui adus de plată). */
  async function beforeExtension(eventId: string) {
    const [row] = await sql<{ to_final_price_minor: string; to_purge_at: Date }>(
      "select to_final_price_minor, to_purge_at from public.event_retention_changes where event_id = $1 order by id desc offset 1 limit 1",
      [eventId],
    );
    return row;
  }

  it("rambursarea integrală readuce perioada, prețul final și data de dinainte, cu istoric „payment”", async () => {
    const paid = await paidExtension("refund-ext");
    const before = await beforeExtension(paid.eventId);
    const { data, error } = await refund(paid.paymentIntentId, paid.amountMinor);
    expect(error).toBeNull();
    expect(data).toEqual([{ outcome: "retention_reverted", event_id: paid.eventId }]);

    const after = await retention(paid.eventId);
    expect(after?.months).toBe(3);
    expect(after?.final).toBe(before?.to_final_price_minor);
    expect(after?.purge_at.getTime()).toBe(before?.to_purge_at.getTime());
    const [log] = await sql<{ actor_kind: string; from_months: number; to_months: number }>(
      "select actor_kind::text, from_months, to_months from public.event_retention_changes where event_id = $1 order by id desc limit 1",
      [paid.eventId],
    );
    expect(log).toEqual({ actor_kind: "payment", from_months: 12, to_months: 3 });
    expect((await paymentRow(paid.paymentId))?.refund_effect).toBe("retention_reverted");
    expect(await eventStatus(paid.eventId)).toBe("active");
  });

  it("revine și dacă opțiunea de dinainte a fost dezactivată între timp în catalog", async () => {
    await sql("insert into public.retention_options (months, surcharge_minor, active) values (7, 5000, true) on conflict (months) do update set active = true");
    try {
      const paid = await paidExtension("refund-ext-inactive", { months: 7, toMonths: 12 });
      await sql("update public.retention_options set active = false where months = 7");
      expect((await refund(paid.paymentIntentId, paid.amountMinor)).data?.[0]?.outcome).toBe("retention_reverted");
      expect((await retention(paid.eventId))?.months).toBe(7);
    } finally {
      await sql("update public.retention_options set active = false where months = 7");
    }
  });

  it("o schimbare a păstrării după prelungire cere ajustare manuală, cu email (FR-009)", async () => {
    const paid = await paidExtension("refund-ext-changed");
    await sql("update public.events set retention_option_id = $2 where id = $1", [paid.eventId, await optionId(6)]);
    expect((await refund(paid.paymentIntentId, paid.amountMinor)).data?.[0]?.outcome).toBe("manual_adjustment");
    expect((await retention(paid.eventId))?.months).toBe(6);
    expect(await manualNotices(paid.paymentId)).toHaveLength(1);
  });

  it("o prelungire fără valorile de dinainte (anterioară lui 004) cere ajustare manuală", async () => {
    const paid = await paidExtension("refund-ext-legacy");
    await sql(
      "update public.payments set previous_retention_option_id = null, previous_retention_months = null, previous_surcharge_minor = null where id = $1",
      [paid.paymentId],
    );
    expect((await refund(paid.paymentIntentId, paid.amountMinor)).data?.[0]?.outcome).toBe("manual_adjustment");
    expect((await retention(paid.eventId))?.months).toBe(12);
    expect(await manualNotices(paid.paymentId)).toHaveLength(1);
  });

  it("data de dinainte la mai puțin de 7 zile: fără revenire, ajustare manuală (FR-008)", async () => {
    // Uploadul s-a încheiat acum 3 luni minus 3 zile: păstrarea de 3 luni ar expira peste ~3 zile.
    const ends = new Date();
    ends.setMonth(ends.getMonth() - 3);
    ends.setTime(ends.getTime() + 3 * DAY);
    const paid = await paidExtension("refund-ext-soon", { uploadStartsAt: new Date(ends.getTime() - DAY), uploadEndsAt: ends });
    expect((await refund(paid.paymentIntentId, paid.amountMinor)).data?.[0]?.outcome).toBe("manual_adjustment");
    expect((await retention(paid.eventId))?.months).toBe(12);
  });

  it("evenimentul suspendat: fără schimbare și fără email; parțial: păstrarea neschimbată", async () => {
    const paid = await paidExtension("refund-ext-suspended");
    await sql("select public.transition_event($1, 'suspended', 'admin', null, 'test')", [paid.eventId]);
    expect((await refund(paid.paymentIntentId, paid.amountMinor)).data?.[0]?.outcome).toBe("none");
    expect((await retention(paid.eventId))?.months).toBe(12);
    expect(await manualNotices(paid.paymentId)).toHaveLength(0);

    const partial = await paidExtension("refund-ext-partial");
    expect((await refund(partial.paymentIntentId, 1)).data?.[0]?.outcome).toBe("partial");
    expect((await retention(partial.eventId))?.months).toBe(12);
  });
});
