import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closePool, createTestEvent, randomEmail, serviceClient, sql } from "../support/clients.ts";

// Mașina de stări a evenimentului (002: FR-022, FR-024; data-model.md › Mașina de stări).
afterAll(closePool);

type Status = "unconfirmed" | "awaiting_activation" | "active" | "suspended" | "expiring" | "expired" | "deleting";

const ALLOWED: [Status | null, Status][] = [
  ["unconfirmed", "awaiting_activation"],
  ["awaiting_activation", "active"],
  ["active", "suspended"],
  ["suspended", "active"],
  ["active", "expiring"],
  ["suspended", "expiring"],
  ["expiring", "expired"],
  ["active", "deleting"],
  ["suspended", "deleting"],
  ["expired", "deleting"],
  ["deleting", "expired"],
  ["active", "active"],
];

/** Eveniment de test aflat direct în starea dată (inserat ca `postgres`, fără istoric). */
async function eventIn(status: Status): Promise<string> {
  const event = await createTestEvent({ organizerEmail: randomEmail("states") });
  if (status !== "active") {
    await sql(
      `update public.events
          set status = $2::public.event_status,
              activated_at = case when $2 in ('unconfirmed', 'awaiting_activation') then null else activated_at end
        where id = $1`,
      [event.id, status],
    );
  }
  return event.id;
}

async function transition(eventId: string, to: Status): Promise<string | null> {
  try {
    await sql("select public.transition_event($1, $2::public.event_status, 'system', null)", [eventId, to]);
    return null;
  } catch (error) {
    return (error as Error).message;
  }
}

describe("event_status_transitions", () => {
  it("conține exact perechile din data-model.md", async () => {
    const rows = await sql<{ from_status: Status; to_status: Status }>(
      "select from_status::text, to_status::text from public.event_status_transitions order by 1, 2",
    );
    const actual = rows.map((r) => `${r.from_status}->${r.to_status}`).sort();
    const expected = ALLOWED.map(([from, to]) => `${String(from)}->${to}`).sort();
    expect(actual).toEqual(expected);
  });
});

describe("transition_event (FR-022, FR-024)", () => {
  beforeAll(async () => {
    // Evenimentele existente au fost marcate ca activate la migrare.
    await sql("select 1");
  });

  it.each(ALLOWED.filter(([from]) => from !== null) as [Status, Status][])(
    "permite %s → %s și scrie exact un rând în istoric",
    async (from, to) => {
      const eventId = await eventIn(from);
      expect(await transition(eventId, to)).toBeNull();
      const [event] = await sql<{ status: string }>("select status::text from public.events where id = $1", [eventId]);
      expect(event?.status).toBe(to);
      const history = await sql<{ from_status: string; to_status: string; source: string; created_at: Date }>(
        "select from_status::text, to_status::text, source::text, created_at from public.event_status_changes where event_id = $1 and source = 'system'",
        [eventId],
      );
      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({ from_status: from, to_status: to, source: "system" });
      expect(history[0]?.created_at).toBeInstanceOf(Date);
    },
  );

  it.each([
    ["unconfirmed", "active"],
    ["awaiting_activation", "suspended"],
    ["suspended", "suspended"],
    ["expired", "active"],
    ["active", "awaiting_activation"],
    ["expiring", "active"],
  ] as [Status, Status][])("refuză %s → %s cu INVALID_TRANSITION", async (from, to) => {
    const eventId = await eventIn(from);
    expect(await transition(eventId, to)).toBe("INVALID_TRANSITION");
    const [event] = await sql<{ status: string }>("select status::text from public.events where id = $1", [eventId]);
    expect(event?.status).toBe(from);
  });

  it("nu poate fi apelată de clienții API, doar de service role", async () => {
    const eventId = await eventIn("active");
    const { error } = await serviceClient().rpc("transition_event", {
      p_event_id: eventId,
      p_to: "suspended",
      p_source: "system",
    });
    expect(error).toBeNull();
    const [grant] = await sql<{ anon: boolean; auth: boolean }>(
      `select has_function_privilege('anon', 'public.transition_event(uuid, public.event_status, public.status_change_source, uuid, text, text, text)', 'execute') as anon,
              has_function_privilege('authenticated', 'public.transition_event(uuid, public.event_status, public.status_change_source, uuid, text, text, text)', 'execute') as auth`,
    );
    expect(grant).toEqual({ anon: false, auth: false });
  });
});

describe("garda pe events.status", () => {
  it("refuză schimbarea directă a stării prin API, chiar cu service role", async () => {
    const eventId = await eventIn("active");
    const { error } = await serviceClient().from("events").update({ status: "suspended" }).eq("id", eventId);
    expect(error?.message).toBe("INVALID_TRANSITION");
    const [event] = await sql<{ status: string }>("select status::text from public.events where id = $1", [eventId]);
    expect(event?.status).toBe("active");
  });

  it("refuză modificarea directă a câmpurilor de activare prin API", async () => {
    const eventId = await eventIn("active");
    const { error } = await serviceClient().from("events").update({ origin: "self_service" }).eq("id", eventId);
    expect(error?.message).toBe("INVALID_TRANSITION");
  });
});
