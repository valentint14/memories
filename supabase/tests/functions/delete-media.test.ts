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

async function addMedia(eventId: string, status = "ready"): Promise<string> {
  const [session] = await sql<{ id: string }>("insert into public.guest_sessions (event_id) values ($1) returning id", [eventId]);
  const [row] = await sql<{ id: string }>(
    `insert into public.media_items (event_id, guest_session_id, kind, declared_mime, original_filename, declared_bytes,
       incoming_path, status, original_path, display_path, thumb_path, uploaded_at)
     values ($1::uuid, $2, 'photo', 'image/jpeg', 'a.jpg', 10, $1::text || '/' || gen_random_uuid()::text,
       $3::public.media_status, $1::text || '/o.jpg', $1::text || '/d.webp', $1::text || '/t.webp', now())
     returning id`,
    [eventId, session?.id, status],
  );
  return row?.id ?? "";
}

beforeAll(async () => {
  const emailA = randomEmail("org-a");
  orgA = await organizerClient(emailA);
  orgB = await organizerClient(randomEmail("org-b"));
  event = await createTestEvent({ organizerEmail: emailA });
});

afterAll(closePool);

describe("delete_media (FR-031, FR-032)", () => {
  it("marchează fișierele `deleting`, întoarce toate căile și pune în coadă curățarea", async () => {
    const id = await addMedia(event.id);
    const { data, error } = await orgA.rpc("delete_media", { p_event_id: event.id, p_media_ids: [id] });
    expect(error).toBeNull();
    expect(data?.[0]?.media_id).toBe(id);
    expect(data?.[0]?.paths).toEqual([`${event.id}/o.jpg`, `${event.id}/d.webp`, `${event.id}/t.webp`]);

    const [row] = await sql<{ status: string }>("select status from public.media_items where id = $1", [id]);
    expect(row?.status).toBe("deleting");
    const jobs = await sql<{ n: string }>(
      "select count(*) as n from pgmq.q_media_jobs where message->>'type' = 'purge_media' and message->'media_ids' ? $1",
      [id],
    );
    expect(Number(jobs[0]?.n)).toBe(1);

    // Fișierul dispare imediat din galerie (RLS exclude `deleting`).
    const visible = await orgA.from("media_items").select("id").eq("id", id);
    expect(visible.data ?? []).toEqual([]);
  });

  it("refuză alt organizator", async () => {
    const id = await addMedia(event.id);
    const { error } = await orgB.rpc("delete_media", { p_event_id: event.id, p_media_ids: [id] });
    expect(error?.message).toBe("FORBIDDEN");
    const [row] = await sql<{ status: string }>("select status from public.media_items where id = $1", [id]);
    expect(row?.status).toBe("ready");
  });

  it("ignoră id-urile care nu aparțin evenimentului", async () => {
    const other = await createTestEvent({ organizerEmail: randomEmail("org") });
    const foreign = await addMedia(other.id);
    const { data } = await orgA.rpc("delete_media", { p_event_id: event.id, p_media_ids: [foreign] });
    expect(data ?? []).toEqual([]);
    const [row] = await sql<{ status: string }>("select status from public.media_items where id = $1", [foreign]);
    expect(row?.status).toBe("ready");
  });

  it("invalidează arhivele evenimentului (o arhivă nu poate conține fișiere șterse)", async () => {
    const id = await addMedia(event.id);
    const [archive] = await sql<{ id: string }>(
      "insert into public.archive_jobs (event_id, status, archive_path, expires_at) values ($1, 'ready', 'a.zip', now() + interval '1 day') returning id",
      [event.id],
    );
    await orgA.rpc("delete_media", { p_event_id: event.id, p_media_ids: [id] });
    const [row] = await sql<{ status: string }>("select status from public.archive_jobs where id = $1", [archive?.id]);
    expect(row?.status).toBe("expired");
  });
});

describe("finalize_media_deletion", () => {
  it("șterge doar rândurile `deleting` ale evenimentelor organizatorului", async () => {
    const deleting = await addMedia(event.id);
    const ready = await addMedia(event.id);
    await orgA.rpc("delete_media", { p_event_id: event.id, p_media_ids: [deleting] });
    const { data } = await orgA.rpc("finalize_media_deletion", { p_media_ids: [deleting, ready] });
    expect(data).toBe(1);
    const rows = await sql<{ id: string }>("select id from public.media_items where id = any($1::uuid[])", [[deleting, ready]]);
    expect(rows.map((r) => r.id)).toEqual([ready]);
  });
});

describe("reconcile_deletions", () => {
  it("pune din nou în coadă rândurile rămase `deleting` de peste 5 minute", async () => {
    const id = await addMedia(event.id, "deleting");
    // Trigger-ul `updated_at` ar suprascrie data; îl oprim doar pentru această simulare.
    await sql("alter table public.media_items disable trigger media_items_updated_at");
    try {
      await sql("update public.media_items set updated_at = now() - interval '6 minutes' where id = $1", [id]);
    } finally {
      await sql("alter table public.media_items enable trigger media_items_updated_at");
    }
    await sql("select public.reconcile_deletions()");
    const jobs = await sql<{ n: string }>(
      "select count(*) as n from pgmq.q_media_jobs where message->>'type' = 'purge_media' and message->'media_ids' ? $1",
      [id],
    );
    expect(Number(jobs[0]?.n)).toBeGreaterThanOrEqual(1);
  });
});
