import { afterAll, describe, expect, it } from "vitest";
import { adminClient, closePool, organizerClient, randomEmail, sql, type SupabaseClient } from "../support/clients.ts";

// Cererea de activare (002: FR-018a) e înlocuită de plata online (003: FR-015); activarea manuală rămâne (FR-014).
afterAll(closePool);

async function awaitingEvent(client: SupabaseClient): Promise<string> {
  const { data, error } = await client.rpc("create_event_as_organizer", {
    p_name: "Nuntă de activat",
    p_event_date: new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10),
    p_terms_version: "2026-10-01",
    p_privacy_version: "2026-10-01",
  });
  if (error) throw new Error(error.message);
  return data;
}

describe("request_activation (003: FR-015)", () => {
  it("nu mai poate fi apelată de organizator și nu anunță administratorii", async () => {
    const client = await organizerClient(randomEmail("act-req"));
    const eventId = await awaitingEvent(client);
    const { error } = await client.rpc("request_activation", { p_event_id: eventId });
    expect(error).not.toBeNull();
    expect(await sql("select 1 from public.activation_requests where event_id = $1", [eventId])).toHaveLength(0);
    const jobs = await sql(
      "select 1 from pgmq.q_media_jobs where message->>'type' = 'admin_activation_notice' and message->>'event_id' = $1",
      [eventId],
    );
    expect(jobs).toHaveLength(0);
  });

  it("cererile vechi rămân vizibile organizatorului, dar nu pot fi inserate direct", async () => {
    const client = await organizerClient(randomEmail("act-rls"));
    const eventId = await awaitingEvent(client);
    await sql("insert into public.activation_requests (event_id) values ($1)", [eventId]);
    const { data } = await client.from("activation_requests").select("event_id").eq("event_id", eventId);
    expect(data).toHaveLength(1);
    expect((await client.from("activation_requests").insert({ event_id: eventId })).error).not.toBeNull();
  });

  it("administratorul activează în continuare manual (FR-014)", async () => {
    const client = await organizerClient(randomEmail("act-manual"));
    const eventId = await awaitingEvent(client);
    const { client: admin } = await adminClient({ aal2: true });
    expect((await admin.rpc("activate_event", { p_event_id: eventId, p_source: "admin" })).error).toBeNull();
    const [event] = await sql<{ status: string }>("select status::text from public.events where id = $1", [eventId]);
    expect(event?.status).toBe("active");
  });
});
