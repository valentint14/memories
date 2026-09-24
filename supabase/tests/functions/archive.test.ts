import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  closePool,
  createTestEvent,
  organizerClient,
  randomEmail,
  sql,
  type SupabaseClient,
  type TestEvent,
} from "../support/clients.ts";

let orgA: SupabaseClient;
let orgB: SupabaseClient;
let event: TestEvent;
let empty: TestEvent;

async function addReadyMedia(eventId: string): Promise<void> {
  const [session] = await sql<{ id: string }>("insert into public.guest_sessions (event_id) values ($1) returning id", [eventId]);
  await sql(
    `insert into public.media_items (event_id, guest_session_id, kind, declared_mime, original_filename,
       declared_bytes, incoming_path, status, original_path, uploaded_at)
     values ($1::uuid, $2, 'photo', 'image/jpeg', 'a.jpg', 10, $1::text || '/' || gen_random_uuid()::text, 'ready', 'x', now())`,
    [eventId, session?.id],
  );
}

beforeAll(async () => {
  const emailA = randomEmail("org-a");
  orgA = await organizerClient(emailA);
  orgB = await organizerClient(randomEmail("org-b"));
  event = await createTestEvent({ organizerEmail: emailA });
  empty = await createTestEvent({ organizerEmail: emailA });
  await addReadyMedia(event.id);
});

afterAll(closePool);

describe("request_archive (FR-030)", () => {
  it("creează un job și pune `build_archive` în coadă; o a doua cerere reutilizează jobul activ", async () => {
    const first = await orgA.rpc("request_archive", { p_event_id: event.id });
    expect(first.error).toBeNull();
    const second = await orgA.rpc("request_archive", { p_event_id: event.id });
    expect(second.data).toBe(first.data);
    const jobs = await sql<{ n: string }>(
      "select count(*) as n from pgmq.q_media_jobs where message->>'type' = 'build_archive' and message->>'archive_job_id' = $1",
      [first.data],
    );
    expect(Number(jobs[0]?.n)).toBe(1);
  });

  it("refuză un eveniment fără fișiere", async () => {
    const { error } = await orgA.rpc("request_archive", { p_event_id: empty.id });
    expect(error?.message).toBe("EMPTY_EVENT");
  });

  it("refuză alt organizator", async () => {
    const { error } = await orgB.rpc("request_archive", { p_event_id: event.id });
    expect(error?.message).toBe("FORBIDDEN");
  });

  it("refuză un eveniment care nu mai e activ", async () => {
    await sql("update public.events set status = 'expiring' where id = $1", [event.id]);
    try {
      const { error } = await orgA.rpc("request_archive", { p_event_id: event.id });
      expect(error?.message).toBe("EVENT_EXPIRED");
    } finally {
      await sql("update public.events set status = 'active' where id = $1", [event.id]);
    }
  });
});

describe("expire_archives", () => {
  it("marchează arhivele expirate și pune în coadă ștergerea lor", async () => {
    const [job] = await sql<{ id: string }>(
      `insert into public.archive_jobs (event_id, status, archive_path, completed_at, expires_at)
       values ($1, 'ready', 'p', now() - interval '25 hours', now() - interval '1 hour') returning id`,
      [event.id],
    );
    await sql("select public.expire_archives()");
    const [row] = await sql<{ status: string }>("select status from public.archive_jobs where id = $1", [job?.id]);
    expect(row?.status).toBe("expired");
    const queued = await sql<{ n: string }>(
      "select count(*) as n from pgmq.q_media_jobs where message->>'type' = 'delete_archive' and message->>'archive_job_id' = $1",
      [job?.id],
    );
    expect(Number(queued[0]?.n)).toBe(1);
  });
});
