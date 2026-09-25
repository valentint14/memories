import { afterAll, describe, expect, it } from "vitest";
import { closePool, createUser, randomEmail, serviceClient, signedInClient, sql } from "../support/clients.ts";

// Crearea self-service și confirmarea (002: FR-003–FR-009, FR-021, FR-040; research R4).
afterAll(closePool);

const TERMS = "2026-10-01";
const PRIVACY = "2026-10-01";

function tomorrow(offsetDays = 1): string {
  const d = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

async function requestEvent(email: string, name = "Nunta Ioana", terms = TERMS): Promise<string> {
  const { data, error } = await serviceClient().rpc("request_self_service_event", {
    p_email: email,
    p_name: name,
    p_event_date: tomorrow(10),
    p_terms_version: terms,
    p_privacy_version: PRIVACY,
  });
  if (error) throw new Error(error.message);
  return data;
}

async function requestRow(id: string) {
  const [row] = await sql<{ status: string; email: string; purpose: string; event_id: string | null; expires_at: Date; created_at: Date }>(
    "select status::text, email::text, purpose::text, event_id, expires_at, created_at from public.auth_requests where id = $1",
    [id],
  );
  return row;
}

async function eventRow(id: string) {
  const [row] = await sql<{ status: string; origin: string; organizer_email: string; pending_purge_at: Date | null; event_date: string }>(
    "select status::text, origin::text, organizer_email::text, pending_purge_at, event_date::text from public.events where id = $1",
    [id],
  );
  return row;
}

describe("request_self_service_event", () => {
  it("creează evenimentul neconfirmat, acceptările și cererea de 15 minute", async () => {
    const email = randomEmail("ss-create");
    const requestId = await requestEvent(email);
    const request = await requestRow(requestId);
    expect(request).toMatchObject({ status: "pending", email, purpose: "create" });
    expect((request?.expires_at.getTime() ?? 0) - (request?.created_at.getTime() ?? 0)).toBe(15 * 60 * 1000);

    const event = await eventRow(request?.event_id ?? "");
    expect(event).toMatchObject({ status: "unconfirmed", origin: "self_service", organizer_email: email });

    const acceptances = await sql<{ document_kind: string; version: string; user_id: string | null }>(
      "select document_kind::text, version, user_id from public.terms_acceptances where event_id = $1 order by 1",
      [request?.event_id],
    );
    expect(acceptances).toEqual([
      { document_kind: "privacy", version: PRIVACY, user_id: null },
      { document_kind: "terms", version: TERMS, user_id: null },
    ]);

    const jobs = await sql<{ message: { type: string; request_id: string; purpose: string } }>(
      "select message from pgmq.q_media_jobs where message->>'request_id' = $1",
      [requestId],
    );
    expect(jobs.map((j) => j.message)).toEqual([expect.objectContaining({ type: "auth_email", purpose: "create" })]);
  });

  it("normalizează adresa și invalidează cererile anterioare ale aceleiași adrese", async () => {
    const email = randomEmail("ss-twice");
    const first = await requestEvent(email.toUpperCase());
    const second = await requestEvent(` ${email} `);
    expect((await requestRow(first))?.status).toBe("invalidated");
    expect(await requestRow(second)).toMatchObject({ status: "pending", email });
  });

  it("refuză versiunile vechi ale documentelor", async () => {
    await expect(requestEvent(randomEmail("ss-terms"), "Nunta", "2020-01-01")).rejects.toThrow("TERMS_OUTDATED");
  });

  it("refuză datele invalide (nume, dată)", async () => {
    await expect(requestEvent(randomEmail("ss-name"), "")).rejects.toThrow();
    const { error } = await serviceClient().rpc("request_self_service_event", {
      p_email: randomEmail("ss-date"),
      p_name: "Nunta",
      p_event_date: "2000-01-01",
      p_terms_version: TERMS,
      p_privacy_version: PRIVACY,
    });
    expect(error?.message).toBe("VALIDATION");
  });

  it("nu poate fi apelată de anon sau authenticated", async () => {
    const [grant] = await sql<{ anon: boolean; auth: boolean }>(
      `select has_function_privilege('anon', 'public.request_self_service_event(extensions.citext, text, date, text, text, text, integer)', 'execute') as anon,
              has_function_privilege('authenticated', 'public.request_self_service_event(extensions.citext, text, date, text, text, text, integer)', 'execute') as auth`,
    );
    expect(grant).toEqual({ anon: false, auth: false });
  });
});

describe("register_failed_code (FR-008)", () => {
  it("invalidează cererea la a 5-a greșeală și cere rotirea codului", async () => {
    const email = randomEmail("ss-fail");
    const requestId = await requestEvent(email);
    const statuses: string[] = [];
    for (let i = 0; i < 5; i++) {
      const { data, error } = await serviceClient().rpc("register_failed_code", { p_request_id: requestId });
      expect(error).toBeNull();
      statuses.push(String(data));
    }
    expect(statuses).toEqual(["pending", "pending", "pending", "pending", "invalidated"]);
    const jobs = await sql("select 1 from pgmq.q_media_jobs where message->>'type' = 'auth_rotate' and message->>'email' = $1", [email]);
    expect(jobs).toHaveLength(1);
  });
});

describe("complete_auth_request (FR-009)", () => {
  it("confirmă evenimentul, calculează data ștergerii și leagă acceptările de utilizator", async () => {
    const email = randomEmail("ss-confirm");
    const requestId = await requestEvent(email);
    const userId = await createUser(email);
    const client = await signedInClient(email);

    const { data, error } = await client.rpc("complete_auth_request", { p_request_id: requestId });
    expect(error).toBeNull();
    const request = await requestRow(requestId);
    expect(data).toEqual([{ purpose: "create", event_id: request?.event_id, outcome: "confirmed" }]);
    expect(request?.status).toBe("used");

    const event = await eventRow(request?.event_id ?? "");
    expect(event?.status).toBe("awaiting_activation");
    // Sfârșitul zilei event_date + 30, ora României.
    const [expected] = await sql<{ at: Date }>(
      "select ((($1::date + 31)::timestamp) at time zone 'Europe/Bucharest') as at",
      [event?.event_date],
    );
    expect(event?.pending_purge_at?.getTime()).toBe(expected?.at.getTime());

    const acceptances = await sql<{ user_id: string }>("select user_id from public.terms_acceptances where event_id = $1", [request?.event_id]);
    expect(acceptances.map((a) => a.user_id)).toEqual([userId, userId]);

    const history = await sql<{ from_status: string; to_status: string; source: string; actor_user_id: string }>(
      "select from_status::text, to_status::text, source::text, actor_user_id from public.event_status_changes where event_id = $1",
      [request?.event_id],
    );
    expect(history).toEqual([{ from_status: "unconfirmed", to_status: "awaiting_activation", source: "organizer", actor_user_id: userId }]);
  });

  it("refuză o adresă diferită, cererile folosite și cele expirate", async () => {
    const email = randomEmail("ss-wrong");
    const requestId = await requestEvent(email);
    const otherEmail = randomEmail("ss-other");
    await createUser(otherEmail);
    const other = await signedInClient(otherEmail);
    expect((await other.rpc("complete_auth_request", { p_request_id: requestId })).error?.message).toBe("REQUEST_EXPIRED");

    await createUser(email);
    const owner = await signedInClient(email);
    await sql("update public.auth_requests set expires_at = now() - interval '1 second' where id = $1", [requestId]);
    expect((await owner.rpc("complete_auth_request", { p_request_id: requestId })).error?.message).toBe("REQUEST_EXPIRED");

    const fresh = await requestEvent(email);
    expect((await owner.rpc("complete_auth_request", { p_request_id: fresh })).error).toBeNull();
    expect((await owner.rpc("complete_auth_request", { p_request_id: fresh })).error?.message).toBe("REQUEST_EXPIRED");
  });

  it("la limita de evenimente în așteptare, autentifică dar lasă evenimentul neconfirmat (FR-021)", async () => {
    const email = randomEmail("ss-limit");
    await createUser(email);
    const client = await signedInClient(email);
    for (let i = 0; i < 2; i++) {
      const id = await requestEvent(email, `Eveniment ${String(i)}`);
      expect((await client.rpc("complete_auth_request", { p_request_id: id })).error).toBeNull();
    }
    const third = await requestEvent(email, "Al treilea");
    const { data, error } = await client.rpc("complete_auth_request", { p_request_id: third });
    expect(error).toBeNull();
    expect(data?.[0]?.outcome).toBe("limit_reached");
    const request = await requestRow(third);
    expect(request?.status).toBe("used");
    expect((await eventRow(request?.event_id ?? ""))?.status).toBe("unconfirmed");
  });
});
