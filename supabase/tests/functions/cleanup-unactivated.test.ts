import { afterAll, describe, expect, it } from "vitest";
import { activateForTest, closePool, organizerClient, randomEmail, sql, type SupabaseClient } from "../support/clients.ts";

// Ștergerea evenimentelor neactivate și avertizarea de 7 zile (002: FR-019, SC-013).
afterAll(closePool);

async function awaitingEvent(client: SupabaseClient, name: string): Promise<string> {
  const { data, error } = await client.rpc("create_event_as_organizer", {
    p_name: name,
    p_event_date: new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10),
    p_terms_version: "2026-10-01",
    p_privacy_version: "2026-10-01",
  });
  if (error) throw new Error(error.message);
  return data;
}

async function exists(eventId: string): Promise<boolean> {
  return (await sql("select 1 from public.events where id = $1", [eventId])).length === 1;
}

describe("purge_unactivated_events", () => {
  it("șterge evenimentele ajunse la termen, cu audit, și cere ștergerea contului rămas fără evenimente", async () => {
    const email = randomEmail("unact");
    const client = await organizerClient(email);
    const due = await awaitingEvent(client, "Scadent");
    await sql("update public.events set pending_purge_at = now() - interval '1 minute' where id = $1", [due]);

    await sql("select public.purge_unactivated_events()");

    expect(await exists(due)).toBe(false);
    const audit = await sql<{ action: string }>("select action from public.app_audit_log where event_id = $1", [due]);
    expect(audit).toEqual([{ action: "auto_deleted_unactivated" }]);
    const [user] = await sql<{ id: string }>("select id from auth.users where email = $1", [email]);
    const jobs = await sql("select 1 from pgmq.q_media_jobs where message->>'type' = 'delete_organizer_user' and message->>'user_id' = $1", [
      user?.id,
    ]);
    expect(jobs).toHaveLength(1);
  });

  it("nu cere ștergerea contului dacă organizatorul mai are evenimente", async () => {
    const email = randomEmail("unact-keep");
    const client = await organizerClient(email);
    const due = await awaitingEvent(client, "Scadent");
    await awaitingEvent(client, "Rămâne");
    await sql("update public.events set pending_purge_at = now() - interval '1 minute' where id = $1", [due]);
    await sql("select public.purge_unactivated_events()");
    const [user] = await sql<{ id: string }>("select id from auth.users where email = $1", [email]);
    const jobs = await sql("select 1 from pgmq.q_media_jobs where message->>'type' = 'delete_organizer_user' and message->>'user_id' = $1", [
      user?.id,
    ]);
    expect(jobs).toHaveLength(0);
  });

  it("nu șterge un eveniment activat în ultima zi, chiar dacă termenul a trecut (caz limită)", async () => {
    const client = await organizerClient(randomEmail("unact-late"));
    const eventId = await awaitingEvent(client, "Activat târziu");
    await sql("update public.events set pending_purge_at = now() - interval '1 minute' where id = $1", [eventId]);
    await activateForTest(eventId);
    await sql("select public.purge_unactivated_events()");
    expect(await exists(eventId)).toBe(true);
  });
});

describe("enqueue_activation_notices", () => {
  it("pune o singură avertizare per dată de ștergere; după mutarea datei, încă una", async () => {
    const client = await organizerClient(randomEmail("unact-notice"));
    const eventId = await awaitingEvent(client, "Cu avertizare");
    await sql("update public.events set pending_purge_at = now() + interval '6 days' where id = $1", [eventId]);

    await sql("select public.enqueue_activation_notices()");
    await sql("select public.enqueue_activation_notices()");
    const count = async () =>
      (
        await sql(
          "select 1 from pgmq.q_media_jobs where message->>'type' = 'retention_notice' and message->>'threshold' = 'activation_7d' and message->>'event_id' = $1",
          [eventId],
        )
      ).length;
    expect(await count()).toBe(1);

    await sql("update public.events set pending_purge_at = now() + interval '5 days' where id = $1", [eventId]);
    await sql("select public.enqueue_activation_notices()");
    expect(await count()).toBe(2);
  });

  it("nu avertizează evenimentele cu termen mai îndepărtat de 7 zile", async () => {
    const client = await organizerClient(randomEmail("unact-far"));
    const eventId = await awaitingEvent(client, "Departe");
    await sql("select public.enqueue_activation_notices()");
    const jobs = await sql("select 1 from pgmq.q_media_jobs where message->>'type' = 'retention_notice' and message->>'event_id' = $1", [eventId]);
    expect(jobs).toHaveLength(0);
  });
});
