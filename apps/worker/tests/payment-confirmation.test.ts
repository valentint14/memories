import { afterEach, describe, expect, it } from "vitest";
import { query } from "../src/db.ts";
import { resetTransport } from "../src/email/transport.ts";
import { paymentConfirmation } from "../src/jobs/payment-confirmation.ts";
import { ctx, randomEmail } from "./support.ts";

// Emailul de confirmare a plății (003: FR-010, FR-012; contracts/worker-jobs.md).
const MAILPIT = process.env.MAILPIT_URL ?? `http://${process.env.SMTP_HOST ?? "127.0.0.1"}:54324`;

async function mailsTo(address: string): Promise<{ ID: string; Subject: string }[]> {
  const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${address}"`)}`);
  return ((await res.json()) as { messages: { ID: string; Subject: string }[] }).messages;
}

async function message(id: string): Promise<{ Text: string; HTML: string }> {
  const res = await fetch(`${MAILPIT}/api/v1/message/${id}`);
  return (await res.json()) as { Text: string; HTML: string };
}

/** Eveniment activ al unei adrese noi, cu o plată în starea dată (inserate ca `postgres`). */
async function paidEvent(
  email: string,
  name: string,
  status: "paid" | "open",
  purpose: "activation" | "retention_extension" = "activation",
): Promise<{ eventId: string; paymentId: string }> {
  const [event] = await query<{ id: string }>(
    `insert into public.events (name, event_date, organizer_email, upload_starts_at, upload_ends_at, base_price_minor, retention_option_id)
     values ($1, current_date, $2, now() - interval '1 hour', now() + interval '1 day', 29900,
             (select id from public.retention_options where months = 12))
     returning id`,
    [name, email],
  );
  const [payment] = await query<{ id: string }>(
    `insert into public.payments (event_id, event_name, organizer_email, purpose, retention_option_id, retention_months,
       base_price_minor, surcharge_minor, amount_minor, status, stripe_session_id, stripe_payment_intent_id, paid_at, expires_at)
     values ($1, $2, $3, $4::public.payment_purpose, (select id from public.retention_options where months = 12), 12,
             29900, 9900, case when $4 = 'activation' then 39800 else 9900 end, $5::public.payment_status,
             'cs_test_' || gen_random_uuid(), case when $5 = 'paid' then 'pi_' || gen_random_uuid() end,
             case when $5 = 'paid' then now() end, now() + interval '1 day')
     returning id`,
    [event?.id, name, email, purpose, status],
  );
  return { eventId: event?.id ?? "", paymentId: payment?.id ?? "" };
}

afterEach(() => {
  resetTransport();
});

describe("payment_confirmation (FR-010)", () => {
  it("trimite organizatorului suma, data, evenimentul, perioada și data ștergerii, cu linkul", async () => {
    const organizer = randomEmail("pay-mail");
    const { eventId, paymentId } = await paidEvent(organizer, "Nunta <Ana> & Mihai", "paid");

    await paymentConfirmation.run({ type: "payment_confirmation", payment_id: paymentId }, ctx);

    const [mail] = await mailsTo(organizer);
    expect(mail?.Subject).toBe("Plata pentru „Nunta <Ana> & Mihai” a fost primită");
    const { Text: text, HTML: html } = await message(mail?.ID ?? "");
    expect(text).toContain("398,00");
    expect(text).toContain("12 luni");
    expect(text).toMatch(/se șterg automat pe \d+ \S+ \d{4}/);
    expect(text).toContain("Invitații pot încărca de acum");
    expect(text).toMatch(/chitanța/i);
    expect(text).toContain(`/events/${eventId}`);
    expect(html).toContain("Nunta &#60;Ana&#62; &#38; Mihai");
  });

  it("pentru prelungire: suma, noua perioadă și noua dată de ștergere, fără „pot încărca”", async () => {
    const organizer = randomEmail("pay-ext");
    const { paymentId } = await paidEvent(organizer, "Botezul lui Luca", "paid", "retention_extension");

    await paymentConfirmation.run({ type: "payment_confirmation", payment_id: paymentId }, ctx);

    const [mail] = await mailsTo(organizer);
    const { Text: text } = await message(mail?.ID ?? "");
    expect(text).toContain("99,00");
    expect(text).toContain("prelungirea păstrării");
    expect(text).toContain("12 luni");
    expect(text).toMatch(/se șterg automat pe \d+ \S+ \d{4}/);
    expect(text).not.toContain("Invitații pot încărca de acum");
  });

  it("nu trimite nimic pentru o plată care nu e plătită", async () => {
    const organizer = randomEmail("pay-open");
    const { paymentId } = await paidEvent(organizer, "Botez", "open");
    await paymentConfirmation.run({ type: "payment_confirmation", payment_id: paymentId }, ctx);
    expect(await mailsTo(organizer)).toHaveLength(0);
  });
});
