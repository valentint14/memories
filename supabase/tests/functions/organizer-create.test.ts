import { afterAll, describe, expect, it } from "vitest";
import { closePool, createTestEvent, organizerClient, randomEmail, sql, type SupabaseClient } from "../support/clients.ts";

// Crearea din cont, fără email de confirmare (002: FR-005, FR-021, FR-041).
afterAll(closePool);

const V = "2026-10-01";

function inDays(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

async function create(client: SupabaseClient, name: string, versions = true) {
  return client.rpc("create_event_as_organizer", {
    p_name: name,
    p_event_date: inDays(20),
    ...(versions ? { p_terms_version: V, p_privacy_version: V } : {}),
  });
}

describe("create_event_as_organizer", () => {
  it("creează direct în așteptarea activării, cu istoric și acceptări legate de utilizator", async () => {
    const email = randomEmail("oc-direct");
    const client = await organizerClient(email);
    const { data: eventId, error } = await create(client, "Botez Luca");
    expect(error).toBeNull();

    const [event] = await sql<{ status: string; origin: string; organizer_email: string; pending_purge_at: Date | null }>(
      "select status::text, origin::text, organizer_email::text, pending_purge_at from public.events where id = $1",
      [eventId],
    );
    expect(event).toMatchObject({ status: "awaiting_activation", origin: "self_service", organizer_email: email });
    expect(event?.pending_purge_at).toBeInstanceOf(Date);

    const history = await sql<{ from_status: string | null; to_status: string; source: string }>(
      "select from_status::text, to_status::text, source::text from public.event_status_changes where event_id = $1",
      [eventId],
    );
    expect(history).toEqual([{ from_status: null, to_status: "awaiting_activation", source: "organizer" }]);

    const acceptances = await sql<{ user_id: string | null }>("select user_id from public.terms_acceptances where event_id = $1", [eventId]);
    expect(acceptances).toHaveLength(2);
    expect(acceptances.every((a) => a.user_id !== null)).toBe(true);
  });

  it("aplică limita de evenimente în așteptare; cele create de administrator nu se numără", async () => {
    const email = randomEmail("oc-limit");
    const client = await organizerClient(email);
    await createTestEvent({ organizerEmail: email });
    expect((await create(client, "Unu")).error).toBeNull();
    expect((await create(client, "Doi", false)).error).toBeNull();
    expect((await create(client, "Trei", false)).error?.message).toBe("AWAITING_LIMIT_REACHED");
  });

  it("cere versiunile curente dacă utilizatorul nu le-a acceptat încă (FR-041)", async () => {
    const email = randomEmail("oc-terms");
    const client = await organizerClient(email);
    expect((await create(client, "Fără termeni", false)).error?.message).toBe("TERMS_OUTDATED");
    const old = await client.rpc("create_event_as_organizer", {
      p_name: "Versiune veche",
      p_event_date: inDays(20),
      p_terms_version: "2020-01-01",
      p_privacy_version: V,
    });
    expect(old.error?.message).toBe("TERMS_OUTDATED");
    // După o acceptare a versiunii curente, nu mai trebuie trimise.
    expect((await create(client, "Cu termeni")).error).toBeNull();
    expect((await create(client, "Fără, dar deja acceptați", false)).error).toBeNull();
  });

  it("validează numele și data", async () => {
    const client = await organizerClient(randomEmail("oc-invalid"));
    expect((await create(client, "")).error?.message).toBe("VALIDATION");
    const past = await client.rpc("create_event_as_organizer", {
      p_name: "Trecut",
      p_event_date: "2020-01-01",
      p_terms_version: V,
      p_privacy_version: V,
    });
    expect(past.error?.message).toBe("VALIDATION");
  });
});
