import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { query } from "../src/db.ts";
import { resetTransport } from "../src/email/transport.ts";
import { expireEvent } from "../src/jobs/expire-event.ts";
import { retentionNotice } from "../src/jobs/retention-notice.ts";
import { createEvent, ctx, listCount, putObject, randomEmail } from "./support.ts";

const MAILPIT = process.env.MAILPIT_URL ?? `http://${process.env.SMTP_HOST ?? "127.0.0.1"}:54324`;

interface MailSummary {
  ID: string;
  Subject: string;
}

async function mailsTo(address: string): Promise<MailSummary[]> {
  const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${address}"`)}`);
  return ((await res.json()) as { messages: MailSummary[] }).messages;
}

async function mailText(id: string): Promise<string> {
  const res = await fetch(`${MAILPIT}/api/v1/message/${id}`);
  return ((await res.json()) as { Text: string }).Text;
}

afterEach(() => {
  resetTransport();
});

describe("expire_event (FR-044)", () => {
  it("golește toate prefixele evenimentului și îl marchează `expired`", async () => {
    const event = await createEvent({ organizerEmail: randomEmail("org") });
    await putObject("incoming", `${event.id}/${randomUUID()}`, Buffer.from("x"), "image/jpeg");
    await putObject("media", `${event.id}/${randomUUID()}/original.jpg`, Buffer.from("x"), "image/jpeg");
    await putObject("archives", `${event.id}/${randomUUID()}.zip`, Buffer.from("PK"), "application/zip");
    await query("update public.events set status = 'expiring' where id = $1", [event.id]);

    await expireEvent.run({ type: "expire_event", event_id: event.id }, ctx);

    expect(await listCount("incoming", event.id)).toBe(0);
    expect(await listCount("media", event.id)).toBe(0);
    expect(await listCount("archives", event.id)).toBe(0);
    const [row] = await query<{ status: string }>("select status from public.events where id = $1", [event.id]);
    expect(row?.status).toBe("expired");
  });

  it("ignoră un eveniment care nu e în expirare", async () => {
    const event = await createEvent({ organizerEmail: randomEmail("org") });
    await putObject("media", `${event.id}/x/original.jpg`, Buffer.from("x"), "image/jpeg");
    await expireEvent.run({ type: "expire_event", event_id: event.id }, ctx);
    expect(await listCount("media", event.id)).toBe(1);
  });
});

describe("retention_notice (FR-045)", () => {
  async function prepare(threshold: "30d" | "7d" | "1d") {
    const email = randomEmail("org");
    const event = await createEvent({ organizerEmail: email });
    const purgeAt = event.purge_at;
    await query("insert into public.retention_notices (event_id, threshold, purge_at) values ($1, $2, $3)", [event.id, threshold, purgeAt]);
    return { email, eventId: event.id, purgeAt };
  }

  it("trimite emailul cu data ștergerii în ora României și linkul spre eveniment", async () => {
    const { email, eventId, purgeAt } = await prepare("7d");
    await retentionNotice.run({ type: "retention_notice", event_id: eventId, threshold: "7d", purge_at: purgeAt.toISOString() }, ctx);

    const [mail] = await mailsTo(email);
    expect(mail?.Subject).toContain("Eveniment worker");
    const text = await mailText(mail?.ID ?? "");
    const localDate = new Intl.DateTimeFormat("ro-RO", { timeZone: "Europe/Bucharest", day: "numeric", month: "long", year: "numeric" }).format(purgeAt);
    expect(text).toContain(localDate);
    expect(text).toContain(`/events/${eventId}`);
    expect(text).toContain("7 zile");

    const [row] = await query<{ sent_at: Date | null }>(
      "select sent_at from public.retention_notices where event_id = $1 and threshold = '7d'",
      [eventId],
    );
    expect(row?.sent_at).not.toBeNull();
  });

  it("nu trimite pentru o dată de ștergere depășită (evenimentul a fost prelungit)", async () => {
    const { email, eventId } = await prepare("30d");
    await retentionNotice.run(
      { type: "retention_notice", event_id: eventId, threshold: "30d", purge_at: new Date(Date.now() + 10 * 86_400_000).toISOString() },
      ctx,
    );
    expect(await mailsTo(email)).toHaveLength(0);
  });

  it("nu trimite de două ori același prag", async () => {
    const { email, eventId, purgeAt } = await prepare("1d");
    const message = { type: "retention_notice" as const, event_id: eventId, threshold: "1d" as const, purge_at: purgeAt.toISOString() };
    await retentionNotice.run(message, ctx);
    await retentionNotice.run(message, ctx);
    expect(await mailsTo(email)).toHaveLength(1);
  });

  it("un SMTP indisponibil lasă mesajul în coadă (eroare), fără a marca trimiterea", async () => {
    const { eventId, purgeAt } = await prepare("30d");
    const original = process.env.SMTP_PORT;
    process.env.SMTP_PORT = "1";
    try {
      await expect(
        retentionNotice.run({ type: "retention_notice", event_id: eventId, threshold: "30d", purge_at: purgeAt.toISOString() }, ctx),
      ).rejects.toThrow();
    } finally {
      process.env.SMTP_PORT = original;
    }
    const [row] = await query<{ sent_at: Date | null }>("select sent_at from public.retention_notices where event_id = $1", [eventId]);
    expect(row?.sent_at).toBeNull();
  });
});
