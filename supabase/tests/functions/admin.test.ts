import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  adminClient,
  closePool,
  createTestEvent,
  createUser,
  organizerClient,
  randomEmail,
  sql,
  type SupabaseClient,
  type TestEvent,
} from "../support/clients.ts";

let adminAal1: SupabaseClient;
let adminAal2: SupabaseClient;
let event: TestEvent;
let organizerEmail: string;

beforeAll(async () => {
  adminAal1 = (await adminClient({ aal2: false })).client;
  adminAal2 = (await adminClient({ aal2: true })).client;
  organizerEmail = randomEmail("org");
  await organizerClient(organizerEmail);
  event = await createTestEvent({ organizerEmail, name: "Nunta Ana și Mihai" });
  // Două fișiere „gata” direct în DB, pentru statisticile agregate.
  const [session] = await sql<{ id: string }>(
    "insert into public.guest_sessions (event_id) values ($1) returning id",
    [event.id],
  );
  for (const bytes of [1000, 2500]) {
    await sql(
      `insert into public.media_items (event_id, guest_session_id, kind, declared_mime, original_filename,
         declared_bytes, actual_bytes, incoming_path, status)
       values ($1::uuid, $2, 'photo', 'image/jpeg', 'x.jpg', $3, $3, $1::text || '/' || gen_random_uuid()::text, 'ready')`,
      [event.id, session?.id, bytes],
    );
  }
});

afterAll(closePool);

describe("is_admin (FR-006a)", () => {
  it("e fals fără al doilea factor și adevărat la aal2", async () => {
    expect((await adminAal1.rpc("is_admin")).data).toBe(false);
    expect((await adminAal2.rpc("is_admin")).data).toBe(true);
  });
});

describe("admin_event_stats (FR-007)", () => {
  it("întoarce doar agregate", async () => {
    const { data, error } = await adminAal2.rpc("admin_event_stats", { p_event_id: event.id });
    expect(error).toBeNull();
    expect(data).toEqual([{ event_id: event.id, file_count: 2, total_bytes: 3500 }]);
  });

  it("refuză adminul fără al doilea factor", async () => {
    const { error } = await adminAal1.rpc("admin_event_stats", { p_event_id: event.id });
    expect(error?.message).toBe("FORBIDDEN");
  });

  it("adminul nu citește rândurile media și nici obiectele din Storage", async () => {
    const rows = await adminAal2.from("media_items").select("id").eq("event_id", event.id);
    expect(rows.data ?? []).toEqual([]);
    const list = await adminAal2.storage.from("media").list(event.id);
    expect(list.data ?? []).toEqual([]);
  });
});

describe("request_event_deletion (FR-006b)", () => {
  it("refuză un nume tastat greșit", async () => {
    const { error } = await adminAal2.rpc("request_event_deletion", {
      p_event_id: event.id,
      p_confirm_name: "Nunta Ana si Mihai",
    });
    expect(error?.message).toBe("CONFIRMATION_MISMATCH");
  });

  it("trece evenimentul în `deleting` și pune jobul purge_event în coadă", async () => {
    const { error } = await adminAal2.rpc("request_event_deletion", {
      p_event_id: event.id,
      p_confirm_name: "Nunta Ana și Mihai",
    });
    expect(error).toBeNull();
    const [row] = await sql<{ status: string }>("select status from public.events where id = $1", [event.id]);
    expect(row?.status).toBe("deleting");
    const jobs = await sql<{ n: string }>(
      "select count(*) as n from pgmq.q_media_jobs where message->>'type' = 'purge_event' and message->>'event_id' = $1",
      [event.id],
    );
    expect(Number(jobs[0]?.n)).toBe(1);
  });

  it("e refuzată pentru adminul fără al doilea factor", async () => {
    const other = await createTestEvent({ organizerEmail: randomEmail("org"), name: "Botez" });
    const { error } = await adminAal1.rpc("request_event_deletion", { p_event_id: other.id, p_confirm_name: "Botez" });
    expect(error?.message).toBe("FORBIDDEN");
  });
});

describe("orphan_organizer_user_id (FR-047)", () => {
  it("întoarce utilizatorul doar când emailul nu mai are evenimente și nu e admin", async () => {
    const email = randomEmail("org");
    const userId = await createUser(email);
    const call = async () =>
      (await sql<{ id: string | null }>("select public.orphan_organizer_user_id($1) as id", [email]))[0]?.id;

    const withEvent = await createTestEvent({ organizerEmail: email });
    expect(await call()).toBeNull();

    await sql("delete from public.events where id = $1", [withEvent.id]);
    expect(await call()).toBe(userId);

    await sql("insert into public.platform_admins (user_id) values ($1)", [userId]);
    expect(await call()).toBeNull();
  });
});
