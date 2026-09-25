import { afterAll, describe, expect, it } from "vitest";
import { activateForTest, closePool, organizerClient, randomEmail, sql, type SupabaseClient } from "../support/clients.ts";

// Cererea de activare (002: FR-018a).
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

describe("request_activation", () => {
  it("înregistrează cererea, anunță administratorii și nu schimbă starea", async () => {
    const client = await organizerClient(randomEmail("act-req"));
    const eventId = await awaitingEvent(client);

    const { data, error } = await client.rpc("request_activation", { p_event_id: eventId });
    expect(error).toBeNull();
    expect(new Date(data ?? "").getTime()).toBeGreaterThan(Date.now() - 60_000);

    expect(await sql("select 1 from public.activation_requests where event_id = $1", [eventId])).toHaveLength(1);
    const jobs = await sql(
      "select 1 from pgmq.q_media_jobs where message->>'type' = 'admin_activation_notice' and message->>'event_id' = $1",
      [eventId],
    );
    expect(jobs).toHaveLength(1);
    const [event] = await sql<{ status: string }>("select status::text from public.events where id = $1", [eventId]);
    expect(event?.status).toBe("awaiting_activation");
  });

  it("refuză o a doua cerere în mai puțin de 24 de ore", async () => {
    const client = await organizerClient(randomEmail("act-twice"));
    const eventId = await awaitingEvent(client);
    expect((await client.rpc("request_activation", { p_event_id: eventId })).error).toBeNull();
    const second = await client.rpc("request_activation", { p_event_id: eventId });
    expect(second.error?.message).toBe("ACTIVATION_REQUEST_TOO_SOON");
    expect(second.error?.details).toContain("retryAt");

    await sql("update public.activation_requests set requested_at = now() - interval '25 hours' where event_id = $1", [eventId]);
    expect((await client.rpc("request_activation", { p_event_id: eventId })).error).toBeNull();
  });

  it("e permisă doar proprietarului și doar în așteptarea activării", async () => {
    const owner = await organizerClient(randomEmail("act-owner"));
    const other = await organizerClient(randomEmail("act-other"));
    const eventId = await awaitingEvent(owner);
    expect((await other.rpc("request_activation", { p_event_id: eventId })).error?.message).toBe("FORBIDDEN");

    await activateForTest(eventId);
    expect((await owner.rpc("request_activation", { p_event_id: eventId })).error?.message).toBe("INVALID_TRANSITION");
  });

  it("organizatorul își vede cererile, dar nu le poate insera direct", async () => {
    const client = await organizerClient(randomEmail("act-rls"));
    const eventId = await awaitingEvent(client);
    await client.rpc("request_activation", { p_event_id: eventId });
    const { data } = await client.from("activation_requests").select("event_id").eq("event_id", eventId);
    expect(data).toHaveLength(1);
    expect((await client.from("activation_requests").insert({ event_id: eventId })).error).not.toBeNull();
  });
});
