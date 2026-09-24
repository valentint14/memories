import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  adminClient,
  closePool,
  createTestEvent,
  organizerClient,
  randomEmail,
  serviceClient,
  sql,
  type SupabaseClient,
} from "../support/clients.ts";

// Istoricul stărilor este imuabil (002: FR-024; data-model.md › event_status_changes).
afterAll(closePool);

let ownerEmail: string;
let owner: SupabaseClient;
let other: SupabaseClient;
let admin: SupabaseClient;
let eventId: string;
let adminUserId: string;

beforeAll(async () => {
  ownerEmail = randomEmail("hist-owner");
  owner = await organizerClient(ownerEmail);
  other = await organizerClient(randomEmail("hist-other"));
  ({ client: admin, userId: adminUserId } = await adminClient({ aal2: true }));
  eventId = (await createTestEvent({ organizerEmail: ownerEmail })).id;
  await sql("select public.transition_event($1, 'suspended', 'admin', $2, 'abuz raportat')", [eventId, adminUserId]);
});

describe("event_status_changes", () => {
  it("nu poate fi modificat sau șters, nici de service role", async () => {
    const service = serviceClient();
    const upd = await service.from("event_status_changes").update({ reason: "altceva" }).eq("event_id", eventId).select();
    expect(upd.error).not.toBeNull();
    const del = await service.from("event_status_changes").delete().eq("event_id", eventId).select();
    expect(del.error).not.toBeNull();
    const rows = await sql<{ reason: string | null }>(
      "select reason from public.event_status_changes where event_id = $1 and to_status = 'suspended'",
      [eventId],
    );
    expect(rows).toEqual([{ reason: "abuz raportat" }]);
  });

  it("refuză și modificarea directă ca postgres", async () => {
    await expect(sql("update public.event_status_changes set reason = 'x' where event_id = $1", [eventId])).rejects.toThrow();
    await expect(sql("delete from public.event_status_changes where event_id = $1", [eventId])).rejects.toThrow();
  });

  it("se șterge prin cascadă odată cu evenimentul", async () => {
    const temp = (await createTestEvent({ organizerEmail: randomEmail("hist-temp") })).id;
    await sql("select public.transition_event($1, 'suspended', 'system', null)", [temp]);
    await sql("delete from public.events where id = $1", [temp]);
    const rows = await sql("select 1 from public.event_status_changes where event_id = $1", [temp]);
    expect(rows).toHaveLength(0);
  });

  it("administratorul citește tot istoricul, cu autorul și motivul", async () => {
    const { data, error } = await admin.from("event_status_changes").select("to_status, actor_user_id, reason").eq("event_id", eventId);
    expect(error).toBeNull();
    expect(data).toContainEqual({ to_status: "suspended", actor_user_id: adminUserId, reason: "abuz raportat" });
  });

  it("organizatorul nu citește tabelul direct, ci istoricul propriu fără autorul administratorului", async () => {
    const direct = await owner.from("event_status_changes").select("id").eq("event_id", eventId);
    expect(direct.data ?? []).toHaveLength(0);

    const { data, error } = await owner.rpc("organizer_status_history", { p_event_id: eventId });
    expect(error).toBeNull();
    expect(data).toContainEqual(expect.objectContaining({ to_status: "suspended", source: "admin" }));
    expect(Object.keys(data?.[0] ?? {})).not.toContain("actor_user_id");

    const foreign = await other.rpc("organizer_status_history", { p_event_id: eventId });
    expect(foreign.data ?? []).toHaveLength(0);
  });
});
