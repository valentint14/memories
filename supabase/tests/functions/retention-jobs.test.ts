import { afterAll, describe, expect, it } from "vitest";
import { closePool, createTestEvent, randomEmail, retentionOptionId, sql } from "../support/clients.ts";

afterAll(closePool);

const DAY = 86_400_000;

async function notices(eventId: string) {
  return sql<{ threshold: string; purge_at: Date }>(
    "select threshold::text, purge_at from public.retention_notices where event_id = $1 order by enqueued_at",
    [eventId],
  );
}

async function enqueue(at: Date): Promise<void> {
  await sql("select public.enqueue_retention_notices($1)", [at]);
}

describe("enqueue_retention_notices (FR-045, SC-015)", () => {
  it("emite 30d, apoi 7d, apoi 1d, fiecare o singură dată pentru aceeași dată de ștergere", async () => {
    const event = await createTestEvent({ organizerEmail: randomEmail("org") });
    const purge = new Date(event.purge_at);

    await enqueue(new Date(purge.getTime() - 40 * DAY));
    expect(await notices(event.id)).toHaveLength(0);

    await enqueue(new Date(purge.getTime() - 29 * DAY));
    await enqueue(new Date(purge.getTime() - 29 * DAY));
    expect((await notices(event.id)).map((n) => n.threshold)).toEqual(["30d"]);

    await enqueue(new Date(purge.getTime() - 6 * DAY));
    await enqueue(new Date(purge.getTime() - 12 * 3_600_000));
    await enqueue(new Date(purge.getTime() - 12 * 3_600_000));
    expect((await notices(event.id)).map((n) => n.threshold)).toEqual(["30d", "7d", "1d"]);

    const jobs = await sql<{ n: string }>(
      "select count(*) as n from pgmq.q_media_jobs where message->>'type' = 'retention_notice' and message->>'event_id' = $1",
      [event.id],
    );
    expect(Number(jobs[0]?.n)).toBe(3);
  });

  it("când mai multe praguri sunt depășite, emite doar pe cel mai apropiat", async () => {
    const event = await createTestEvent({ organizerEmail: randomEmail("org") });
    await enqueue(new Date(new Date(event.purge_at).getTime() - 5 * DAY));
    expect((await notices(event.id)).map((n) => n.threshold)).toEqual(["7d"]);
  });

  it("după o prelungire, avertizările se reemit pentru noua dată", async () => {
    const event = await createTestEvent({ organizerEmail: randomEmail("org"), months: 3 });
    const oldPurge = new Date(event.purge_at);
    await enqueue(new Date(oldPurge.getTime() - 20 * DAY));
    await sql("update public.events set retention_option_id = $2 where id = $1", [event.id, await retentionOptionId(6)]);
    const [row] = await sql<{ purge_at: Date }>("select purge_at from public.events where id = $1", [event.id]);
    await enqueue(new Date((row?.purge_at ?? new Date()).getTime() - 20 * DAY));
    const all = await notices(event.id);
    expect(all.map((n) => n.threshold)).toEqual(["30d", "30d"]);
    expect(all[1]?.purge_at.getTime()).toBe(row?.purge_at.getTime());
  });
});

describe("expire_due_events și complete_event_expiry (FR-044)", () => {
  it("trece evenimentele scadente în `expiring`, expiră arhivele și cere golirea Storage", async () => {
    const event = await createTestEvent({ organizerEmail: randomEmail("org") });
    await sql("insert into public.archive_jobs (event_id, status) values ($1, 'ready')", [event.id]);

    await sql("select public.expire_due_events($1)", [new Date(new Date(event.purge_at).getTime() - 1000)]);
    let [row] = await sql<{ status: string }>("select status from public.events where id = $1", [event.id]);
    expect(row?.status).toBe("active");

    await sql("select public.expire_due_events($1)", [new Date(new Date(event.purge_at).getTime() + 1000)]);
    [row] = await sql<{ status: string }>("select status from public.events where id = $1", [event.id]);
    expect(row?.status).toBe("expiring");
    const archives = await sql<{ status: string }>("select status from public.archive_jobs where event_id = $1", [event.id]);
    expect(archives.map((a) => a.status)).toEqual(["expired"]);
    const jobs = await sql<{ n: string }>(
      "select count(*) as n from pgmq.q_media_jobs where message->>'type' = 'expire_event' and message->>'event_id' = $1",
      [event.id],
    );
    expect(Number(jobs[0]?.n)).toBe(1);
  });

  it("complete_event_expiry păstrează doar rândul de facturare și schimbă tokenul", async () => {
    const event = await createTestEvent({ organizerEmail: randomEmail("org") });
    const [session] = await sql<{ id: string }>("insert into public.guest_sessions (event_id, display_name) values ($1, 'Ana') returning id", [event.id]);
    await sql(
      `insert into public.media_items (event_id, guest_session_id, kind, declared_mime, original_filename, declared_bytes, incoming_path, status)
       values ($1::uuid, $2, 'photo', 'image/jpeg', 'a.jpg', 1, $1::text || '/x', 'ready')`,
      [event.id, session?.id],
    );
    await sql("update public.events set status = 'expiring' where id = $1", [event.id]);
    await sql("select public.complete_event_expiry($1)", [event.id]);

    const [row] = await sql<{ status: string; public_token: string; expired_at: Date | null; name: string }>(
      "select status, public_token, expired_at, name from public.events where id = $1",
      [event.id],
    );
    expect(row?.status).toBe("expired");
    expect(row?.expired_at).not.toBeNull();
    expect(row?.public_token).not.toBe(event.public_token);
    expect(row?.name).toBe("Nuntă de test");
    expect(await sql("select 1 from public.media_items where event_id = $1", [event.id])).toEqual([]);
    expect(await sql("select 1 from public.guest_sessions where event_id = $1", [event.id])).toEqual([]);
    expect(await sql("select 1 from public.event_retention_changes where event_id = $1", [event.id])).not.toEqual([]);
  });
});
