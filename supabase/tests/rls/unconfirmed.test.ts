import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anonClient, closePool, organizerClient, randomEmail, serviceClient, sql, type SupabaseClient } from "../support/clients.ts";

// Un eveniment neconfirmat nu e accesibil nimănui (002: FR-004); crearea doar prin server.
afterAll(closePool);

let email: string;
let owner: SupabaseClient;
let other: SupabaseClient;
let eventId: string;
let token: string;

beforeAll(async () => {
  email = randomEmail("unconf");
  owner = await organizerClient(email);
  other = await organizerClient(randomEmail("unconf-other"));
  const { data, error } = await serviceClient().rpc("request_self_service_event", {
    p_email: email,
    p_name: "Botez neconfirmat",
    p_event_date: new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10),
    p_terms_version: "2026-10-01",
    p_privacy_version: "2026-10-01",
  });
  if (error) throw new Error(error.message);
  const [row] = await sql<{ event_id: string; public_token: string }>(
    "select r.event_id, e.public_token from public.auth_requests r join public.events e on e.id = r.event_id where r.id = $1",
    [data],
  );
  eventId = row?.event_id ?? "";
  token = row?.public_token ?? "";
});

describe("eveniment neconfirmat", () => {
  it("nu apare organizatorului cu aceeași adresă, altui organizator sau lui anon", async () => {
    for (const client of [owner, other, anonClient()]) {
      const events = await client.from("events").select("id").eq("id", eventId);
      expect(events.data ?? []).toHaveLength(0);
      const view = await client.from("organizer_events").select("id").eq("id", eventId);
      expect(view.data ?? []).toHaveLength(0);
    }
  });

  it("nu poate fi deschis de invitați", async () => {
    const { data, error } = await serviceClient().rpc("resolve_event_for_guest", { p_token: token });
    expect(error).toBeNull();
    expect(data?.[0]).toMatchObject({ event_id: null, state: "not_found" });
  });

  it("auth_requests nu poate fi citit sau modificat de clienți", async () => {
    for (const client of [owner, anonClient()]) {
      expect((await client.from("auth_requests").select("id")).error).not.toBeNull();
      expect((await client.from("auth_requests").update({ failed_attempts: 0 }).eq("email", email)).error).not.toBeNull();
    }
  });

  it("anon și organizatorii nu pot insera evenimente", async () => {
    const row = { name: "Hack", event_date: "2030-01-01", organizer_email: email };
    expect((await anonClient().from("events").insert(row)).error).not.toBeNull();
    expect((await owner.from("events").insert(row)).error).not.toBeNull();
  });
});
