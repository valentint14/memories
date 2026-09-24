import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  adminClient,
  anonClient,
  closePool,
  createTestEvent,
  organizerClient,
  randomEmail,
  serviceClient,
  sql,
  type SupabaseClient,
  type TestEvent,
} from "../support/clients.ts";

// Matricea RLS (contracts/database-functions.md) pentru media, Storage, arhive și sesiuni (SC-012).
let orgA: SupabaseClient;
let orgB: SupabaseClient;
let adminAal2: SupabaseClient;
let eventA: TestEvent;
let mediaId: string;
const objectPath = () => `${eventA.id}/${mediaId}/thumb.webp`;

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

beforeAll(async () => {
  const emailA = randomEmail("org-a");
  orgA = await organizerClient(emailA);
  orgB = await organizerClient(randomEmail("org-b"));
  adminAal2 = (await adminClient({ aal2: true })).client;
  eventA = await createTestEvent({ organizerEmail: emailA });
  const [session] = await sql<{ id: string }>("insert into public.guest_sessions (event_id) values ($1) returning id", [eventA.id]);
  const [media] = await sql<{ id: string }>(
    `insert into public.media_items (event_id, guest_session_id, kind, declared_mime, original_filename,
       declared_bytes, incoming_path, status, thumb_path)
     values ($1::uuid, $2, 'photo', 'image/jpeg', 'a.jpg', 10, $1::text || '/' || gen_random_uuid()::text, 'ready', 'x')
     returning id`,
    [eventA.id, session?.id],
  );
  mediaId = media?.id ?? "";
  await sql("insert into public.archive_jobs (event_id, status) values ($1, 'ready')", [eventA.id]);
  const service = serviceClient();
  await service.storage.from("media").upload(objectPath(), PNG, { contentType: "image/webp" });
  await service.storage.from("incoming").upload(`${eventA.id}/${mediaId}`, PNG, { contentType: "image/png" });
});

afterAll(closePool);

describe("media_items", () => {
  it("organizatorul A vede fișierele evenimentului său", async () => {
    const { data } = await orgA.from("media_items").select("id").eq("event_id", eventA.id);
    expect(data?.map((r) => r.id)).toEqual([mediaId]);
  });

  it.each([
    ["organizatorul B", () => orgB],
    ["administratorul aal2", () => adminAal2],
    ["anon", () => anonClient()],
  ])("%s nu vede nimic", async (_label, client) => {
    const { data } = await client().from("media_items").select("id").eq("event_id", eventA.id);
    expect(data ?? []).toEqual([]);
  });

  it("organizatorul nu poate modifica sau șterge direct rândurile", async () => {
    const upd = await orgA.from("media_items").update({ guest_name: "x" }).eq("id", mediaId).select("id");
    expect(upd.data ?? []).toEqual([]);
    const del = await orgA.from("media_items").delete().eq("id", mediaId).select("id");
    expect(del.data ?? []).toEqual([]);
  });
});

describe("storage", () => {
  it("organizatorul A poate crea un URL semnat pentru media evenimentului său", async () => {
    const { data, error } = await orgA.storage.from("media").createSignedUrl(objectPath(), 60);
    expect(error).toBeNull();
    expect(data?.signedUrl).toContain("token=");
  });

  it.each([
    ["organizatorul B", () => orgB],
    ["administratorul aal2", () => adminAal2],
    ["anon", () => anonClient()],
  ])("%s nu poate citi media lui A", async (_label, client) => {
    const { data } = await client().storage.from("media").createSignedUrl(objectPath(), 60);
    expect(data?.signedUrl).toBeUndefined();
  });

  it("nimeni din client nu citește bucket-ul incoming", async () => {
    const { data } = await orgA.storage.from("incoming").createSignedUrl(`${eventA.id}/${mediaId}`, 60);
    expect(data?.signedUrl).toBeUndefined();
  });

  it("organizatorul nu poate scrie în Storage", async () => {
    const { error } = await orgA.storage.from("media").upload(`${eventA.id}/x.webp`, PNG, { contentType: "image/webp" });
    expect(error).not.toBeNull();
  });
});

describe("archive_jobs și guest_sessions", () => {
  it("organizatorul A vede arhivele evenimentului său, B nu", async () => {
    expect((await orgA.from("archive_jobs").select("id").eq("event_id", eventA.id)).data).toHaveLength(1);
    expect((await orgB.from("archive_jobs").select("id").eq("event_id", eventA.id)).data ?? []).toEqual([]);
  });

  it("sesiunile invitaților nu sunt accesibile din client", async () => {
    expect((await orgA.from("guest_sessions").select("id").eq("event_id", eventA.id)).data ?? []).toEqual([]);
    expect((await adminAal2.from("guest_sessions").select("id")).data ?? []).toEqual([]);
  });
});

describe("după trecerea în `expiring` (FR-044)", () => {
  it("organizatorul A nu mai citește media și nu mai poate emite URL-uri semnate", async () => {
    await sql("update public.events set status = 'expiring' where id = $1", [eventA.id]);
    try {
      const rows = await orgA.from("media_items").select("id").eq("event_id", eventA.id);
      expect(rows.data ?? []).toEqual([]);
      const { data } = await orgA.storage.from("media").createSignedUrl(objectPath(), 60);
      expect(data?.signedUrl).toBeUndefined();
      // Evenimentul rămâne vizibil în listă (ca „expirat”), dar fără fișiere.
      const events = await orgA.from("organizer_events").select("id, status").eq("id", eventA.id);
      expect(events.data?.[0]?.status).toBe("expiring");
    } finally {
      await sql("update public.events set status = 'active' where id = $1", [eventA.id]);
    }
  });
});
