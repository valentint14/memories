import { afterEach, describe, expect, it } from "vitest";
import { query } from "../src/db.ts";
import { resetTransport } from "../src/email/transport.ts";
import { adminPaymentNotice } from "../src/jobs/admin-payment-notice.ts";
import { createUser, ctx, randomEmail } from "./support.ts";

// Plățile de verificat de administrator (003: FR-011, FR-016a; contracts/worker-jobs.md).
const MAILPIT = process.env.MAILPIT_URL ?? `http://${process.env.SMTP_HOST ?? "127.0.0.1"}:54324`;

async function mailsTo(address: string): Promise<{ ID: string; Subject: string }[]> {
  const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${address}"`)}`);
  return ((await res.json()) as { messages: { ID: string; Subject: string }[] }).messages;
}

async function mailText(id: string): Promise<string> {
  const res = await fetch(`${MAILPIT}/api/v1/message/${id}`);
  return ((await res.json()) as { Text: string }).Text;
}

/** Plată de rambursat; `withEvent = false` simulează evenimentul șters. */
async function refundDue(organizer: string, withEvent = true): Promise<{ paymentId: string; eventId: string | null }> {
  let eventId: string | null = null;
  if (withEvent) {
    const [event] = await query<{ id: string }>(
      `insert into public.events (name, event_date, organizer_email, upload_starts_at, upload_ends_at, base_price_minor, retention_option_id)
       values ('Nunta Maria & Dan', current_date, $1, now() - interval '1 hour', now() + interval '1 day', 29900,
               (select id from public.retention_options where months = 3))
       returning id`,
      [organizer],
    );
    eventId = event?.id ?? null;
  }
  const [payment] = await query<{ id: string }>(
    `insert into public.payments (event_id, event_name, organizer_email, purpose, retention_option_id, retention_months,
       base_price_minor, surcharge_minor, amount_minor, status, refund_reason, stripe_session_id, stripe_payment_intent_id, paid_at, expires_at)
     values ($1, 'Nunta Maria & Dan', $2, 'activation', (select id from public.retention_options where months = 3), 3,
             29900, 0, 29900, 'refund_due', 'DUPLICATE_PAYMENT', 'cs_test_' || gen_random_uuid(), 'pi_test_' || gen_random_uuid(), now(), now())
     returning id`,
    [eventId, organizer],
  );
  return { paymentId: payment?.id ?? "", eventId };
}

afterEach(() => {
  resetTransport();
  delete process.env.ADMIN_NOTIFY_EMAILS;
});

describe("admin_payment_notice (FR-011, FR-016a)", () => {
  it("trimite administratorilor motivul, plata, referința și ce au de făcut", async () => {
    const admin = randomEmail("pay-admin");
    process.env.ADMIN_NOTIFY_EMAILS = admin;
    const organizer = randomEmail("pay-org");
    const { paymentId, eventId } = await refundDue(organizer);

    await adminPaymentNotice.run({ type: "admin_payment_notice", payment_id: paymentId, reason: "DUPLICATE_PAYMENT" }, ctx);

    const [mail] = await mailsTo(admin);
    expect(mail?.Subject).toBe("Plată de verificat: Nunta Maria & Dan");
    const text = await mailText(mail?.ID ?? "");
    expect(text).toContain("a doua plată reușită");
    expect(text).toContain(organizer);
    expect(text).toContain("299,00");
    expect(text).toMatch(/pi_test_/);
    expect(text).toContain("rambursează");
    expect(text).toContain(`/admin/events/${eventId ?? ""}`);
  });

  it("pentru o contestație, spune că evenimentul a fost suspendat; merge și fără eveniment", async () => {
    const admin = randomEmail("pay-admin2");
    const adminId = await createUser(admin);
    await query("insert into public.platform_admins (user_id) values ($1)", [adminId]);
    const { paymentId } = await refundDue(randomEmail("pay-org2"), false);

    await adminPaymentNotice.run({ type: "admin_payment_notice", payment_id: paymentId, reason: "DISPUTE" }, ctx);

    const [mail] = await mailsTo(admin);
    const text = await mailText(mail?.ID ?? "");
    expect(text).toContain("a contestat plata");
    expect(text).toContain("suspendat automat");
    expect(text).toContain("(eveniment șters)");
  });
});

describe("admin_payment_notice: păstrarea de ajustat manual (004: FR-009)", () => {
  it("spune că prelungirea a fost rambursată și că păstrarea se ajustează din fișa evenimentului", async () => {
    const admin = randomEmail("pay-admin-ret");
    process.env.ADMIN_NOTIFY_EMAILS = admin;
    const { paymentId, eventId } = await refundDue(randomEmail("pay-org-ret"));

    await adminPaymentNotice.run({ type: "admin_payment_notice", payment_id: paymentId, reason: "RETENTION_MANUAL" }, ctx);

    const [mail] = await mailsTo(admin);
    const text = await mailText(mail?.ID ?? "");
    expect(text).toContain("Plata prelungirii a fost rambursată");
    expect(text).toContain("ajustează păstrarea din fișa evenimentului");
    expect(text).not.toContain("rambursează plata");
    expect(text).toContain(`/admin/events/${eventId ?? ""}`);
  });
});
