import { afterAll, describe, expect, it } from "vitest";
import { closePool, createTestEvent, createUser, randomEmail, sql } from "../support/clients.ts";

afterAll(closePool);

const YEAR = 365 * 86_400_000;

async function expire(eventId: string, expiredAt: Date): Promise<void> {
  await sql("update public.events set status = 'expired', expired_at = $2 where id = $1", [eventId, expiredAt]);
}

describe("anonymize_expired_events (FR-047)", () => {
  it("anonimizează doar evenimentele expirate de peste 3 ani, o singură dată", async () => {
    const email = randomEmail("org");
    const userId = await createUser(email);
    const old = await createTestEvent({ organizerEmail: email, basePriceMinor: 29_900 });
    const recent = await createTestEvent({ organizerEmail: randomEmail("org") });
    const now = new Date();
    // 3 ani calendaristici includ un an bisect: câteva zile de marjă față de prag.
    await expire(old.id, new Date(now.getTime() - 3 * YEAR - 5 * 86_400_000));
    await expire(recent.id, new Date(now.getTime() - 2 * YEAR));
    await sql("update public.event_retention_changes set actor_user_id = $2 where event_id = $1", [old.id, userId]);

    await sql("select public.anonymize_expired_events($1)", [now]);

    const [a] = await sql<{ name: string | null; organizer_email: string | null; anonymized_at: Date | null; final_price_minor: string; retention_months: number }>(
      "select name, organizer_email, anonymized_at, final_price_minor, retention_months from public.events where id = $1",
      [old.id],
    );
    expect(a?.name).toBeNull();
    expect(a?.organizer_email).toBeNull();
    expect(a?.anonymized_at?.getTime()).toBe(now.getTime());
    expect(Number(a?.final_price_minor)).toBe(29_900);
    expect(a?.retention_months).toBe(3);
    const history = await sql<{ actor_user_id: string | null }>(
      "select actor_user_id from public.event_retention_changes where event_id = $1",
      [old.id],
    );
    expect(history.every((h) => h.actor_user_id === null)).toBe(true);

    const [b] = await sql<{ name: string | null }>("select name from public.events where id = $1", [recent.id]);
    expect(b?.name).not.toBeNull();

    // Contul organizatorului rămas fără evenimente se șterge (prin worker).
    const jobs = await sql<{ n: string }>(
      "select count(*) as n from pgmq.q_media_jobs where message->>'type' = 'delete_organizer_user' and message->>'user_id' = $1",
      [userId],
    );
    expect(Number(jobs[0]?.n)).toBe(1);

    // A doua rulare nu schimbă nimic.
    await sql("select public.anonymize_expired_events($1)", [new Date(now.getTime() + 1000)]);
    const [again] = await sql<{ anonymized_at: Date }>("select anonymized_at from public.events where id = $1", [old.id]);
    expect(again?.anonymized_at.getTime()).toBe(now.getTime());
  });

  it("constrângerea refuză un nume NULL pe un eveniment neanonimizat", async () => {
    const event = await createTestEvent({ organizerEmail: randomEmail("org") });
    await expect(sql("update public.events set name = null where id = $1", [event.id])).rejects.toThrow(/events_identity_until_anonymized/);
  });

  it("nu cere ștergerea contului dacă emailul mai are alt eveniment sau e admin", async () => {
    const email = randomEmail("org");
    const userId = await createUser(email);
    const old = await createTestEvent({ organizerEmail: email });
    await createTestEvent({ organizerEmail: email });
    await expire(old.id, new Date(Date.now() - 4 * YEAR));
    await sql("select public.anonymize_expired_events()");
    const jobs = await sql<{ n: string }>(
      "select count(*) as n from pgmq.q_media_jobs where message->>'type' = 'delete_organizer_user' and message->>'user_id' = $1",
      [userId],
    );
    expect(Number(jobs[0]?.n)).toBe(0);
  });
});
