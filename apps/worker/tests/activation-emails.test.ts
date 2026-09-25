import { afterEach, describe, expect, it } from "vitest";
import { query } from "../src/db.ts";
import { resetTransport } from "../src/email/transport.ts";
import { adminActivationNotice } from "../src/jobs/admin-activation-notice.ts";
import { retentionNotice } from "../src/jobs/retention-notice.ts";
import { createUser, ctx, randomEmail } from "./support.ts";

// Emailurile din US3 (002: FR-018a, FR-019; contracts/worker-jobs.md).
const MAILPIT = process.env.MAILPIT_URL ?? `http://${process.env.SMTP_HOST ?? "127.0.0.1"}:54324`;

async function mailsTo(address: string): Promise<{ ID: string; Subject: string }[]> {
  const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${address}"`)}`);
  return ((await res.json()) as { messages: { ID: string; Subject: string }[] }).messages;
}

async function mailText(id: string): Promise<string> {
  const res = await fetch(`${MAILPIT}/api/v1/message/${id}`);
  return ((await res.json()) as { Text: string }).Text;
}

/** Eveniment `awaiting_activation` al unei adrese noi (inserat ca `postgres`). */
async function awaitingEvent(email: string, name: string): Promise<string> {
  const [row] = await query<{ id: string }>(
    `insert into public.events (name, event_date, organizer_email, origin, status, pending_purge_at)
     values ($1, current_date + 10, $2, 'self_service', 'awaiting_activation', now() + interval '6 days')
     returning id`,
    [name, email],
  );
  return row?.id ?? "";
}

afterEach(() => {
  resetTransport();
  delete process.env.ADMIN_NOTIFY_EMAILS;
});

describe("admin_activation_notice (FR-018a)", () => {
  it("trimite administratorilor configurați datele evenimentului și linkul de administrare", async () => {
    const admin = randomEmail("notify-admin");
    process.env.ADMIN_NOTIFY_EMAILS = admin;
    const organizer = randomEmail("notify-org");
    const eventId = await awaitingEvent(organizer, "Nunta Maria & Dan");
    await query("insert into public.activation_requests (event_id) values ($1)", [eventId]);

    await adminActivationNotice.run({ type: "admin_activation_notice", event_id: eventId }, ctx);

    const [mail] = await mailsTo(admin);
    expect(mail?.Subject).toBe("Cerere de activare: Nunta Maria & Dan");
    const text = await mailText(mail?.ID ?? "");
    expect(text).toContain(organizer);
    expect(text).toContain(`/admin/events/${eventId}`);
  });

  it("fără ADMIN_NOTIFY_EMAILS, scrie adresele din platform_admins", async () => {
    const admin = randomEmail("platform-admin");
    const adminId = await createUser(admin);
    await query("insert into public.platform_admins (user_id) values ($1)", [adminId]);
    const eventId = await awaitingEvent(randomEmail("notify-org2"), "Botez");
    await query("insert into public.activation_requests (event_id) values ($1)", [eventId]);

    await adminActivationNotice.run({ type: "admin_activation_notice", event_id: eventId }, ctx);
    expect(await mailsTo(admin)).toHaveLength(1);
  });
});

describe("retention_notice — activation_7d (FR-019)", () => {
  it("trimite organizatorului data ștergerii și prețul, o singură dată", async () => {
    const organizer = randomEmail("unact-mail");
    const eventId = await awaitingEvent(organizer, "Aniversare Ioana");
    const [event] = await query<{ pending_purge_at: Date }>("select pending_purge_at from public.events where id = $1", [eventId]);
    const purgeAt = event?.pending_purge_at ?? new Date();
    await query("insert into public.retention_notices (event_id, threshold, purge_at) values ($1, 'activation_7d', $2)", [eventId, purgeAt]);
    const message = { type: "retention_notice", event_id: eventId, threshold: "activation_7d", purge_at: purgeAt.toISOString() } as const;

    await retentionNotice.run(message, ctx);
    await retentionNotice.run(message, ctx);

    const mails = await mailsTo(organizer);
    expect(mails).toHaveLength(1);
    expect(mails[0]?.Subject).toMatch(/^Evenimentul „Aniversare Ioana” se șterge pe \d+ \S+ \d{4}$/);
    const text = await mailText(mails[0]?.ID ?? "");
    expect(text).toContain("299,00");
    expect(text).toContain(`/events/${eventId}`);
  });

  it("nu trimite dacă data ștergerii s-a schimbat între timp", async () => {
    const organizer = randomEmail("unact-moved");
    const eventId = await awaitingEvent(organizer, "Mutat");
    const old = new Date(Date.now() + 3 * 86_400_000);
    await query("insert into public.retention_notices (event_id, threshold, purge_at) values ($1, 'activation_7d', $2)", [eventId, old]);
    await retentionNotice.run(
      { type: "retention_notice", event_id: eventId, threshold: "activation_7d", purge_at: old.toISOString() },
      ctx,
    );
    expect(await mailsTo(organizer)).toHaveLength(0);
  });
});
