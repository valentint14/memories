import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  activateForTest,
  adminClient,
  closePool,
  createTestEvent,
  organizerClient,
  randomEmail,
  retentionOptionId,
  sql,
  type SupabaseClient,
} from "../support/clients.ts";

// Suspendarea și accesul organizatorului în timpul ei (002: FR-020, FR-028, FR-028a).
afterAll(closePool);

let admin: SupabaseClient;
let adminAal1: SupabaseClient;

beforeAll(async () => {
  admin = (await adminClient({ aal2: true })).client;
  adminAal1 = (await adminClient({ aal2: false })).client;
});

async function readyMedia(eventId: string): Promise<string> {
  const [session] = await sql<{ id: string }>("insert into public.guest_sessions (event_id) values ($1) returning id", [eventId]);
  const [media] = await sql<{ id: string }>(
    `insert into public.media_items (event_id, guest_session_id, kind, declared_mime, original_filename,
       declared_bytes, actual_bytes, incoming_path, status)
     values ($1::uuid, $2, 'photo', 'image/jpeg', 'x.jpg', 10, 10, $1::text || '/' || gen_random_uuid()::text, 'ready')
     returning id`,
    [eventId, session?.id],
  );
  return media?.id ?? "";
}

describe("suspend_event / reactivate_event", () => {
  it("cer admin aal2 și motiv, scriu istoricul și nu ating arhivele", async () => {
    const email = randomEmail("susp");
    await organizerClient(email);
    const event = await createTestEvent({ organizerEmail: email });
    await readyMedia(event.id);
    await sql("insert into public.archive_jobs (event_id, status) values ($1, 'building')", [event.id]);

    expect((await adminAal1.rpc("suspend_event", { p_event_id: event.id, p_reason: "abuz" })).error?.message).toBe("FORBIDDEN");
    expect((await admin.rpc("suspend_event", { p_event_id: event.id, p_reason: "" })).error?.message).toBe("REASON_REQUIRED");
    expect((await admin.rpc("suspend_event", { p_event_id: event.id, p_reason: "conținut raportat" })).error).toBeNull();

    const [archive] = await sql<{ status: string }>("select status::text from public.archive_jobs where event_id = $1", [event.id]);
    expect(archive?.status).toBe("building");

    expect((await admin.rpc("reactivate_event", { p_event_id: event.id, p_reason: "verificat" })).error).toBeNull();
    const rows = await sql<{ to_status: string; reason: string }>(
      "select to_status::text, reason from public.event_status_changes where event_id = $1 and source = 'admin' and reason is not null and reason <> 'creat de administrator' order by id",
      [event.id],
    );
    expect(rows).toEqual([
      { to_status: "suspended", reason: "conținut raportat" },
      { to_status: "active", reason: "verificat" },
    ]);
  });

  it("în suspendare, organizatorul vede, descarcă și șterge fișierele și cere arhiva, dar nu prelungește", async () => {
    const email = randomEmail("susp-org");
    const owner = await organizerClient(email);
    const event = await createTestEvent({ organizerEmail: email });
    const mediaId = await readyMedia(event.id);
    await admin.rpc("suspend_event", { p_event_id: event.id, p_reason: "verificare" });

    const media = await owner.from("media_items").select("id").eq("event_id", event.id);
    expect(media.data).toEqual([{ id: mediaId }]);
    const archive = await owner.rpc("request_archive", { p_event_id: event.id });
    expect(archive.error).toBeNull();
    const deleted = await owner.rpc("delete_media", { p_event_id: event.id, p_media_ids: [mediaId] });
    expect(deleted.error).toBeNull();

    const extend = await owner.rpc("extend_retention", {
      p_event_id: event.id,
      p_option_id: await retentionOptionId(12),
      p_expected_final_price_minor: 0,
    });
    expect(extend.error?.message).toBe("EVENT_NOT_ACTIVE");
  });

  it("refuză prelungirea retenției și pentru un eveniment neactivat (FR-020)", async () => {
    const email = randomEmail("susp-await");
    const owner = await organizerClient(email);
    const { data: eventId } = await owner.rpc("create_event_as_organizer", {
      p_name: "Neactivat",
      p_event_date: new Date(Date.now() + 9 * 86_400_000).toISOString().slice(0, 10),
      p_terms_version: "2026-10-01",
      p_privacy_version: "2026-10-01",
    });
    const extend = await owner.rpc("extend_retention", {
      p_event_id: eventId ?? "",
      p_option_id: await retentionOptionId(12),
      p_expected_final_price_minor: 0,
    });
    expect(extend.error?.message).toBe("EVENT_NOT_ACTIVE");
  });
});

describe("admin_update_pending_event (FR-028)", () => {
  it("modifică numele și data doar pentru evenimentele neactivate", async () => {
    const owner = await organizerClient(randomEmail("pending-edit"));
    const { data: eventId } = await owner.rpc("create_event_as_organizer", {
      p_name: "Nume greșit",
      p_event_date: new Date(Date.now() + 9 * 86_400_000).toISOString().slice(0, 10),
      p_terms_version: "2026-10-01",
      p_privacy_version: "2026-10-01",
    });
    const newDate = new Date(Date.now() + 40 * 86_400_000).toISOString().slice(0, 10);
    const { error } = await admin.rpc("admin_update_pending_event", { p_event_id: eventId ?? "", p_name: "Nume corect", p_event_date: newDate });
    expect(error).toBeNull();
    const [row] = await sql<{ name: string; event_date: string; pending_purge_at: Date; expected: Date }>(
      `select name, event_date::text, pending_purge_at,
              (($2::date + 31)::timestamp at time zone 'Europe/Bucharest') as expected
         from public.events where id = $1`,
      [eventId, newDate],
    );
    expect(row).toMatchObject({ name: "Nume corect", event_date: newDate });
    expect(row?.pending_purge_at.getTime()).toBe(row?.expected.getTime());

    await activateForTest(eventId ?? "");
    const again = await admin.rpc("admin_update_pending_event", { p_event_id: eventId ?? "", p_name: "Altul", p_event_date: newDate });
    expect(again.error?.message).toBe("INVALID_TRANSITION");
  });
});
