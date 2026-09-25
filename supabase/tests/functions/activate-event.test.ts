import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  adminClient,
  closePool,
  organizerClient,
  randomEmail,
  serviceClient,
  sql,
  type SupabaseClient,
} from "../support/clients.ts";

// Activarea pachetului complet (002: FR-016, FR-025, FR-026, FR-028).
afterAll(closePool);

let admin: SupabaseClient;
let adminAal1: SupabaseClient;

beforeAll(async () => {
  admin = (await adminClient({ aal2: true })).client;
  adminAal1 = (await adminClient({ aal2: false })).client;
});

async function awaitingEvent(eventDate: string): Promise<string> {
  const client = await organizerClient(randomEmail("activate"));
  const { data, error } = await client.rpc("create_event_as_organizer", {
    p_name: "Nuntă de activat",
    p_event_date: eventDate,
    p_terms_version: "2026-10-01",
    p_privacy_version: "2026-10-01",
  });
  if (error) throw new Error(error.message);
  return data;
}

function inDays(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

interface EventRow {
  status: string;
  package_id: string | null;
  base_price_minor: string | null;
  max_files_per_guest: number;
  max_photo_bytes: string;
  max_video_bytes: string;
  retention_option_id: string | null;
  activated_at: Date | null;
  pending_purge_at: Date | null;
  upload_starts_at: Date | null;
  upload_ends_at: Date | null;
  purge_at: Date | null;
}

async function eventRow(id: string): Promise<EventRow | undefined> {
  const [row] = await sql<EventRow>(
    `select status::text, package_id, base_price_minor, max_files_per_guest, max_photo_bytes, max_video_bytes,
            retention_option_id, activated_at, pending_purge_at, upload_starts_at, upload_ends_at, purge_at
       from public.events where id = $1`,
    [id],
  );
  return row;
}

async function history(id: string) {
  return sql<{ from_status: string | null; to_status: string; source: string; reason: string | null; note: string | null; external_ref: string | null }>(
    "select from_status::text, to_status::text, source::text, reason, note, external_ref from public.event_status_changes where event_id = $1 order by id",
    [id],
  );
}

describe("activate_event (FR-025)", () => {
  it("copiază pachetul, deschide uploadul și calculează data ștergerii", async () => {
    const eventDate = inDays(10);
    const eventId = await awaitingEvent(eventDate);
    const { data, error } = await admin.rpc("activate_event", { p_event_id: eventId, p_source: "admin", p_reason: "plată primită în cont" });
    expect(error).toBeNull();
    expect(data).toEqual([{ already_active: false }]);

    const [pkg] = await sql<{ id: string; price_minor: string; max_files_per_guest: number; retention_option_id: string }>(
      "select id, price_minor, max_files_per_guest, retention_option_id from public.packages where code = 'complete'",
    );
    const event = await eventRow(eventId);
    expect(event).toMatchObject({
      status: "active",
      package_id: pkg?.id,
      base_price_minor: pkg?.price_minor,
      max_files_per_guest: pkg?.max_files_per_guest,
      retention_option_id: pkg?.retention_option_id,
      pending_purge_at: null,
    });
    expect(event?.activated_at).toBeInstanceOf(Date);
    expect(Math.abs((event?.upload_starts_at?.getTime() ?? 0) - Date.now())).toBeLessThan(60_000);
    // Sfârșitul zilei de după data evenimentului, ora României.
    const [expected] = await sql<{ ends: Date; purge: Date }>(
      `select (($1::date + 2)::timestamp at time zone 'Europe/Bucharest') as ends,
              ((($1::date + 2)::timestamp + interval '3 months') at time zone 'Europe/Bucharest') as purge`,
      [eventDate],
    );
    expect(event?.upload_ends_at?.getTime()).toBe(expected?.ends.getTime());
    expect(event?.purge_at?.getTime()).toBe(expected?.purge.getTime());

    expect(await history(eventId)).toContainEqual({
      from_status: "awaiting_activation",
      to_status: "active",
      source: "admin",
      reason: "plată primită în cont",
      note: null,
      external_ref: null,
    });
  });

  it("pentru un eveniment cu data trecută, uploadul se închide la sfârșitul zilei de după activare", async () => {
    const eventId = await awaitingEvent(inDays(1));
    await sql("update public.events set event_date = current_date - 5 where id = $1", [eventId]);
    await admin.rpc("activate_event", { p_event_id: eventId, p_source: "admin", p_reason: "activare întârziată" });
    const [expected] = await sql<{ ends: Date }>(
      "select ((((now() at time zone 'Europe/Bucharest')::date + 2)::timestamp) at time zone 'Europe/Bucharest') as ends",
    );
    expect((await eventRow(eventId))?.upload_ends_at?.getTime()).toBe(expected?.ends.getTime());
  });

  it("e idempotentă: a doua activare scrie doar istoricul; aceeași referință de plată nu scrie nimic", async () => {
    const eventId = await awaitingEvent(inDays(15));
    const service = serviceClient();
    const first = await service.rpc("activate_event", { p_event_id: eventId, p_source: "payment", p_reason: "plată online", p_external_ref: "pay_123" });
    expect(first.data).toEqual([{ already_active: false }]);
    const before = await eventRow(eventId);

    const repeated = await service.rpc("activate_event", { p_event_id: eventId, p_source: "payment", p_reason: "plată online", p_external_ref: "pay_123" });
    expect(repeated.data).toEqual([{ already_active: true }]);
    const byAdmin = await admin.rpc("activate_event", { p_event_id: eventId, p_source: "admin", p_reason: "reconfirmare" });
    expect(byAdmin.data).toEqual([{ already_active: true }]);

    expect(await eventRow(eventId)).toEqual(before);
    const rows = await history(eventId);
    expect(rows.filter((r) => r.external_ref === "pay_123")).toHaveLength(1);
    expect(rows.at(-1)).toMatchObject({ from_status: "active", to_status: "active", note: "activare repetată" });
  });

  it("cere motiv, admin aal2 pentru sursa admin și service role pentru plăți", async () => {
    const eventId = await awaitingEvent(inDays(12));
    expect((await admin.rpc("activate_event", { p_event_id: eventId, p_source: "admin", p_reason: " " })).error?.message).toBe(
      "REASON_REQUIRED",
    );
    expect((await adminAal1.rpc("activate_event", { p_event_id: eventId, p_source: "admin", p_reason: "x" })).error?.message).toBe(
      "FORBIDDEN",
    );
    expect((await admin.rpc("activate_event", { p_event_id: eventId, p_source: "payment", p_reason: "x" })).error?.message).toBe(
      "FORBIDDEN",
    );
    const owner = await organizerClient(randomEmail("activate-self"));
    expect((await owner.rpc("activate_event", { p_event_id: eventId, p_source: "admin", p_reason: "x" })).error?.message).toBe("FORBIDDEN");
  });

  it("refuză stările din care nu se poate activa", async () => {
    const eventId = await awaitingEvent(inDays(9));
    await admin.rpc("activate_event", { p_event_id: eventId, p_source: "admin", p_reason: "activare" });
    await admin.rpc("suspend_event", { p_event_id: eventId, p_reason: "abuz" });
    expect((await admin.rpc("activate_event", { p_event_id: eventId, p_source: "admin", p_reason: "x" })).error?.message).toBe(
      "INVALID_TRANSITION",
    );
  });

  it("modificările ulterioare ale pachetului nu ating evenimentul activat (FR-016)", async () => {
    const eventId = await awaitingEvent(inDays(8));
    await admin.rpc("activate_event", { p_event_id: eventId, p_source: "admin", p_reason: "activare" });
    const before = await eventRow(eventId);
    const [pkg] = await sql<{ price_minor: string }>("select price_minor from public.packages where code = 'complete'");
    await sql("update public.packages set price_minor = price_minor + 100 where code = 'complete'");
    try {
      expect((await eventRow(eventId))?.base_price_minor).toBe(before?.base_price_minor);
    } finally {
      await sql("update public.packages set price_minor = $1 where code = 'complete'", [pkg?.price_minor]);
    }
  });
});
