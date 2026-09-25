import { afterAll, describe, expect, it } from "vitest";
import { closePool, randomEmail, serviceClient, sql } from "../support/clients.ts";

// Evenimentele neconfirmate se șterg după 24 de ore (002: FR-004, SC-005; research R6).
afterAll(closePool);

async function unconfirmedEvent(): Promise<{ requestId: string; eventId: string }> {
  const { data, error } = await serviceClient().rpc("request_self_service_event", {
    p_email: randomEmail("cleanup"),
    p_name: "Aniversare",
    p_event_date: new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10),
    p_terms_version: "2026-10-01",
    p_privacy_version: "2026-10-01",
  });
  if (error) throw new Error(error.message);
  const [row] = await sql<{ event_id: string }>("select event_id from public.auth_requests where id = $1", [data]);
  return { requestId: data, eventId: row?.event_id ?? "" };
}

describe("purge_unconfirmed_events", () => {
  it("șterge evenimentele neconfirmate mai vechi de 24 h, cu cererile și acceptările lor", async () => {
    const old = await unconfirmedEvent();
    const fresh = await unconfirmedEvent();
    await sql("update public.events set created_at = now() - interval '25 hours' where id = $1", [old.eventId]);

    const [result] = await sql<{ deleted: number }>("select public.purge_unconfirmed_events() as deleted");
    expect(result?.deleted).toBeGreaterThanOrEqual(1);

    expect(await sql("select 1 from public.events where id = $1", [old.eventId])).toHaveLength(0);
    expect(await sql("select 1 from public.auth_requests where id = $1", [old.requestId])).toHaveLength(0);
    expect(await sql("select 1 from public.terms_acceptances where event_id = $1", [old.eventId])).toHaveLength(0);
    expect(await sql("select 1 from public.events where id = $1", [fresh.eventId])).toHaveLength(1);

    const [log] = await sql<{ details: { count: number } }>(
      "select details from public.app_audit_log where action = 'auto_deleted_unconfirmed_count' order by id desc limit 1",
    );
    expect(log?.details.count).toBeGreaterThanOrEqual(1);
  });

  it("e programată la 15 minute", async () => {
    const [job] = await sql<{ schedule: string }>("select schedule from cron.job where jobname = 'purge-unconfirmed'");
    expect(job?.schedule).toBe("*/15 * * * *");
  });
});

describe("purge_stale_auth_users (research R6)", () => {
  it("pune în coadă ștergerea conturilor neconfirmate, fără evenimente, mai vechi de 24 h", async () => {
    const service = serviceClient();
    const stale = randomEmail("stale");
    const fresh = randomEmail("stale-fresh");
    const withEvent = randomEmail("stale-event");
    const ids: Record<string, string> = {};
    for (const email of [stale, fresh, withEvent]) {
      const { data, error } = await service.auth.admin.createUser({ email, email_confirm: false });
      if (error) throw error;
      ids[email] = data.user.id;
    }
    await sql("update auth.users set created_at = now() - interval '25 hours' where id = any($1::uuid[])", [
      [ids[stale], ids[withEvent]],
    ]);
    await service.rpc("request_self_service_event", {
      p_email: withEvent,
      p_name: "Are eveniment",
      p_event_date: new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10),
      p_terms_version: "2026-10-01",
      p_privacy_version: "2026-10-01",
    });

    await sql("select public.purge_stale_auth_users()");

    const queued = async (id: string | undefined) =>
      (await sql("select 1 from pgmq.q_media_jobs where message->>'type' = 'delete_organizer_user' and message->>'user_id' = $1", [id]))
        .length;
    expect(await queued(ids[stale])).toBe(1);
    expect(await queued(ids[fresh])).toBe(0);
    expect(await queued(ids[withEvent])).toBe(0);
  });
});
