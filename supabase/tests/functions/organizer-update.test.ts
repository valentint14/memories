import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  adminClient,
  closePool,
  createTestEvent,
  organizerClient,
  randomEmail,
  sql,
  type SupabaseClient,
} from "../support/clients.ts";

// Modificarea numelui și a datei de către organizator (002: FR-019, FR-033, FR-034, FR-028a).
afterAll(closePool);

let admin: SupabaseClient;

beforeAll(async () => {
  admin = (await adminClient({ aal2: true })).client;
});

function inDays(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

async function awaitingEvent(client: SupabaseClient): Promise<string> {
  const { data, error } = await client.rpc("create_event_as_organizer", {
    p_name: "Nume inițial",
    p_event_date: inDays(15),
    p_terms_version: "2026-10-01",
    p_privacy_version: "2026-10-01",
  });
  if (error) throw new Error(error.message);
  return data;
}

async function row(id: string) {
  const [r] = await sql<{ name: string; event_date: string; public_token: string; pending_purge_at: Date | null; upload_ends_at: Date | null; purge_at: Date | null }>(
    "select name, event_date::text, public_token, pending_purge_at, upload_ends_at, purge_at from public.events where id = $1",
    [id],
  );
  return r;
}

async function endOfDayAfter(date: string, offset: number): Promise<number> {
  const [r] = await sql<{ at: Date }>(`select (($1::date + $2::int)::timestamp at time zone 'Europe/Bucharest') as at`, [date, offset]);
  return r?.at.getTime() ?? 0;
}

describe("organizer_update_event", () => {
  it("pentru un eveniment neactivat, modifică numele și data și recalculează data ștergerii; tokenul rămâne", async () => {
    const owner = await organizerClient(randomEmail("upd-await"));
    const eventId = await awaitingEvent(owner);
    const before = await row(eventId);
    const newDate = inDays(40);
    const { error } = await owner.rpc("organizer_update_event", { p_event_id: eventId, p_name: "  Nume nou  ", p_event_date: newDate });
    expect(error).toBeNull();
    const after = await row(eventId);
    expect(after).toMatchObject({ name: "Nume nou", event_date: newDate, public_token: before?.public_token });
    expect(after?.pending_purge_at?.getTime()).toBe(await endOfDayAfter(newDate, 31));
  });

  it("pentru un eveniment self-service activ, recalculează perioada de upload (FR-034)", async () => {
    const owner = await organizerClient(randomEmail("upd-active"));
    const eventId = await awaitingEvent(owner);
    await admin.rpc("activate_event", { p_event_id: eventId, p_source: "admin", p_reason: "activare" });
    const newDate = inDays(30);
    expect((await owner.rpc("organizer_update_event", { p_event_id: eventId, p_name: "Mutat", p_event_date: newDate })).error).toBeNull();
    const after = await row(eventId);
    expect(after?.upload_ends_at?.getTime()).toBe(await endOfDayAfter(newDate, 2));
    const [purge] = await sql<{ at: Date }>(
      "select ((($1::date + 2)::timestamp + interval '3 months') at time zone 'Europe/Bucharest') as at",
      [newDate],
    );
    expect(after?.purge_at?.getTime()).toBe(purge?.at.getTime());
  });

  it("după sfârșitul uploadului, data ștergerii nu se mai schimbă", async () => {
    const email = randomEmail("upd-ended");
    const owner = await organizerClient(email);
    const event = await createTestEvent({
      organizerEmail: email,
      uploadStartsAt: new Date(Date.now() - 3 * 86_400_000),
      uploadEndsAt: new Date(Date.now() - 86_400_000),
    });
    const before = await row(event.id);
    expect((await owner.rpc("organizer_update_event", { p_event_id: event.id, p_name: "Redenumit", p_event_date: inDays(1) })).error).toBeNull();
    const after = await row(event.id);
    expect(after?.name).toBe("Redenumit");
    expect(after?.purge_at?.getTime()).toBe(before?.purge_at?.getTime());
  });

  it("refuză alt organizator, evenimentele suspendate și datele invalide", async () => {
    const email = randomEmail("upd-owner");
    const owner = await organizerClient(email);
    const other = await organizerClient(randomEmail("upd-other"));
    const eventId = await awaitingEvent(owner);
    expect((await other.rpc("organizer_update_event", { p_event_id: eventId, p_name: "X", p_event_date: inDays(5) })).error?.message).toBe(
      "FORBIDDEN",
    );
    expect((await owner.rpc("organizer_update_event", { p_event_id: eventId, p_name: "", p_event_date: inDays(5) })).error?.message).toBe(
      "VALIDATION",
    );
    expect(
      (await owner.rpc("organizer_update_event", { p_event_id: eventId, p_name: "X", p_event_date: "2020-01-01" })).error?.message,
    ).toBe("VALIDATION");

    const active = await createTestEvent({ organizerEmail: email });
    await admin.rpc("suspend_event", { p_event_id: active.id, p_reason: "verificare" });
    expect(
      (await owner.rpc("organizer_update_event", { p_event_id: active.id, p_name: "X", p_event_date: inDays(5) })).error?.message,
    ).toBe("EVENT_SUSPENDED");
  });
});

describe("request_event_deletion — organizatorul (FR-035)", () => {
  it("un eveniment niciodată activat dispare direct; alt organizator nu îl poate șterge", async () => {
    const owner = await organizerClient(randomEmail("del-await"));
    const other = await organizerClient(randomEmail("del-other"));
    const eventId = await awaitingEvent(owner);
    expect((await other.rpc("request_event_deletion", { p_event_id: eventId, p_confirm_name: "Nume inițial" })).error?.message).toBe(
      "FORBIDDEN",
    );
    expect((await owner.rpc("request_event_deletion", { p_event_id: eventId, p_confirm_name: "Alt nume" })).error?.message).toBe(
      "CONFIRMATION_MISMATCH",
    );
    expect((await owner.rpc("request_event_deletion", { p_event_id: eventId, p_confirm_name: "Nume inițial" })).error).toBeNull();
    expect(await sql("select 1 from public.events where id = $1", [eventId])).toHaveLength(0);
  });

  it("un eveniment activat trece prin ștergere, cu istoric sursa organizator, și își păstrează facturarea", async () => {
    const email = randomEmail("del-active");
    const owner = await organizerClient(email);
    const event = await createTestEvent({ organizerEmail: email, name: "Nunta de șters" });
    expect((await owner.rpc("request_event_deletion", { p_event_id: event.id, p_confirm_name: "Nunta de șters" })).error).toBeNull();

    const [r] = await sql<{ status: string; deletion_keeps_billing: boolean }>(
      "select status::text, deletion_keeps_billing from public.events where id = $1",
      [event.id],
    );
    expect(r).toEqual({ status: "deleting", deletion_keeps_billing: true });
    const [change] = await sql<{ source: string; actor_user_id: string | null }>(
      "select source::text, actor_user_id from public.event_status_changes where event_id = $1 and to_status = 'deleting'",
      [event.id],
    );
    expect(change?.source).toBe("organizer");
    expect(change?.actor_user_id).not.toBeNull();
    const jobs = await sql("select 1 from pgmq.q_media_jobs where message->>'type' = 'purge_event' and message->>'event_id' = $1", [event.id]);
    expect(jobs).toHaveLength(1);

    // Finalizarea (după golirea Storage de către worker) păstrează rândul de facturare.
    await sql("select public.complete_event_expiry($1)", [event.id]);
    const [final] = await sql<{ status: string; final_price_minor: string; public_token: string }>(
      "select status::text, final_price_minor, public_token from public.events where id = $1",
      [event.id],
    );
    expect(final?.status).toBe("expired");
    expect(Number(final?.final_price_minor)).toBe(event.final_price_minor);
    expect(final?.public_token).not.toBe(event.public_token);
  });

  it("organizatorul nu poate șterge un eveniment expirat", async () => {
    const email = randomEmail("del-expired");
    const owner = await organizerClient(email);
    const event = await createTestEvent({ organizerEmail: email, name: "Expirat" });
    await sql("update public.events set status = 'expired', expired_at = now() where id = $1", [event.id]);
    expect((await owner.rpc("request_event_deletion", { p_event_id: event.id, p_confirm_name: "Expirat" })).error?.message).toBe(
      "FORBIDDEN",
    );
  });
});

describe("request_event_deletion — administratorul, eveniment neactivat", () => {
  it("șterge direct un eveniment niciodată activat", async () => {
    const owner = await organizerClient(randomEmail("del-admin-await"));
    const eventId = await awaitingEvent(owner);
    expect((await admin.rpc("request_event_deletion", { p_event_id: eventId, p_confirm_name: "Nume inițial" })).error).toBeNull();
    expect(await sql("select 1 from public.events where id = $1", [eventId])).toHaveLength(0);
  });
});
