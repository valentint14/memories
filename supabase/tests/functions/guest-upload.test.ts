import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { closePool, createTestEvent, randomEmail, serviceClient, sql } from "../support/clients.ts";

afterAll(closePool);

const service = serviceClient();
const HOUR = 3_600_000;

async function resolve(token: string) {
  const { data, error } = await service.rpc("resolve_event_for_guest", { p_token: token });
  if (error) throw error;
  return data[0];
}

async function startSession(token: string, name: string | null = null): Promise<string> {
  const { data, error } = await service.rpc("start_guest_session", {
    p_token: token,
    p_display_name: name ?? undefined,
    p_ip_hash: randomUUID(),
  });
  if (error) throw error;
  return data;
}

async function reserve(sessionId: string, token: string, mime: string, bytes: number, replace?: string) {
  return service.rpc("reserve_upload", {
    p_session_id: sessionId,
    p_token: token,
    p_filename: "IMG_0001.jpg",
    p_mime: mime,
    p_bytes: bytes,
    ...(replace ? { p_replace_media_id: replace } : {}),
  });
}

/** Simulează finalizarea uploadului TUS: rândul apare în storage.objects. */
async function completeUpload(path: string, size: number) {
  await sql(
    `insert into storage.objects (bucket_id, name, metadata)
     values ('incoming', $1, jsonb_build_object('size', $2::bigint, 'mimetype', 'image/jpeg'))`,
    [path, size],
  );
}

describe("resolve_event_for_guest (FR-020)", () => {
  it("întoarce starea ferestrei de upload", async () => {
    const email = randomEmail("org");
    const open = await createTestEvent({ organizerEmail: email });
    const future = await createTestEvent({
      organizerEmail: email,
      uploadStartsAt: new Date(Date.now() + HOUR),
      uploadEndsAt: new Date(Date.now() + 2 * HOUR),
    });
    expect((await resolve(open.public_token))?.state).toBe("open");
    const notStarted = await resolve(future.public_token);
    expect(notStarted?.state).toBe("not_started");
    expect(notStarted?.upload_starts_at).not.toBeNull();
    expect((await resolve("inexistent-token-xyz"))?.state).toBe("not_found");
  });

  it("tratează evenimentele încheiate, în ștergere sau expirate", async () => {
    const email = randomEmail("org");
    const event = await createTestEvent({ organizerEmail: email });
    await sql("update public.events set upload_starts_at = now() - interval '3 hours', upload_ends_at = now() - interval '1 hour' where id = $1", [event.id]);
    expect((await resolve(event.public_token))?.state).toBe("ended");
    for (const status of ["deleting", "expiring", "expired"]) {
      await sql("update public.events set status = $2::public.event_status where id = $1", [event.id, status]);
      const r = await resolve(event.public_token);
      expect(r?.state).toBe("not_found");
      expect(r?.name).toBeNull();
    }
  });

  it("nu e executabilă de clienții anon", async () => {
    const { anonClient } = await import("../support/clients.ts");
    const { error } = await anonClient().rpc("resolve_event_for_guest", { p_token: "x" });
    expect(error).not.toBeNull();
  });
});

describe("start_guest_session", () => {
  it("refuză un eveniment neînceput și numele peste 50 de caractere", async () => {
    const event = await createTestEvent({
      organizerEmail: randomEmail("org"),
      uploadStartsAt: new Date(Date.now() + HOUR),
      uploadEndsAt: new Date(Date.now() + 2 * HOUR),
    });
    const r1 = await service.rpc("start_guest_session", { p_token: event.public_token, p_ip_hash: "x" });
    expect(r1.error?.message).toBe("UPLOAD_NOT_STARTED");

    const open = await createTestEvent({ organizerEmail: randomEmail("org") });
    const r2 = await service.rpc("start_guest_session", {
      p_token: open.public_token,
      p_display_name: "x".repeat(51),
      p_ip_hash: "x",
    });
    expect(r2.error?.message).toBe("NAME_TOO_LONG");
  });
});

describe("reserve_upload (FR-017)", () => {
  it("verifică tipul, dimensiunea per tip și limita de fișiere", async () => {
    const event = await createTestEvent({ organizerEmail: randomEmail("org"), maxFilesPerGuest: 2, maxPhotoBytes: 1000 });
    const session = await startSession(event.public_token, "Maria 🌸");

    expect((await reserve(session, event.public_token, "application/pdf", 10)).error?.message).toBe("FILE_TYPE_NOT_ALLOWED");

    const tooBig = await reserve(session, event.public_token, "image/jpeg", 1001);
    expect(tooBig.error?.message).toBe("FILE_TOO_LARGE");
    expect(JSON.parse(tooBig.error?.details ?? "{}")).toEqual({ maxBytes: 1000 });

    // Video-ul are propria limită (implicit 1 GB).
    expect((await reserve(session, event.public_token, "video/quicktime", 5000)).error).toBeNull();
    const ok = await reserve(session, event.public_token, "image/heic", 900);
    expect(ok.error).toBeNull();
    expect(ok.data?.[0]?.remaining).toBe(0);
    expect(ok.data?.[0]?.path).toBe(`${event.id}/${ok.data?.[0]?.media_id ?? ""}`);

    const over = await reserve(session, event.public_token, "image/jpeg", 10);
    expect(over.error?.message).toBe("FILE_LIMIT_REACHED");
    expect(JSON.parse(over.error?.details ?? "{}")).toEqual({ limit: 2 });

    const [row] = await sql<{ guest_name: string }>("select guest_name from public.media_items where id = $1", [ok.data?.[0]?.media_id]);
    expect(row?.guest_name).toBe("Maria 🌸");
  });

  it("reutilizează o rezervare nefinalizată la reselectare, fără a consuma limita (FR-016a)", async () => {
    const event = await createTestEvent({ organizerEmail: randomEmail("org"), maxFilesPerGuest: 1 });
    const session = await startSession(event.public_token);
    const first = await reserve(session, event.public_token, "image/jpeg", 100);
    const mediaId = first.data?.[0]?.media_id ?? "";
    const again = await reserve(session, event.public_token, "image/jpeg", 100, mediaId);
    expect(again.error).toBeNull();
    expect(again.data?.[0]?.media_id).toBe(mediaId);

    // O rezervare a altei sesiuni nu poate fi preluată.
    const other = await startSession(event.public_token);
    const stolen = await reserve(other, event.public_token, "image/jpeg", 100, mediaId);
    expect(stolen.data?.[0]?.media_id).not.toBe(mediaId);
  });

  it("refuză rezervări după închiderea perioadei", async () => {
    const event = await createTestEvent({ organizerEmail: randomEmail("org") });
    const session = await startSession(event.public_token);
    await sql("update public.events set upload_starts_at = now() - interval '3 hours', upload_ends_at = now() - interval '1 minute' where id = $1", [event.id]);
    expect((await reserve(session, event.public_token, "image/jpeg", 10)).error?.message).toBe("UPLOAD_ENDED");
  });

  it("o sesiune nu poate rezerva pentru alt eveniment", async () => {
    const a = await createTestEvent({ organizerEmail: randomEmail("org") });
    const b = await createTestEvent({ organizerEmail: randomEmail("org") });
    const session = await startSession(a.public_token);
    expect((await reserve(session, b.public_token, "image/jpeg", 10)).error?.message).toBe("SESSION_MISSING");
  });
});

describe("on_incoming_object_created (FR-021)", () => {
  it("marchează fișierul încărcat și pune jobul `process` în coadă", async () => {
    const event = await createTestEvent({ organizerEmail: randomEmail("org") });
    const session = await startSession(event.public_token);
    const r = await reserve(session, event.public_token, "image/jpeg", 100);
    const { media_id: mediaId, path } = r.data?.[0] ?? { media_id: "", path: "" };
    await completeUpload(path, 123);

    const [row] = await sql<{ status: string; actual_bytes: string; uploaded_at: Date | null }>(
      "select status, actual_bytes, uploaded_at from public.media_items where id = $1",
      [mediaId],
    );
    expect(row?.status).toBe("uploaded");
    expect(Number(row?.actual_bytes)).toBe(123);
    expect(row?.uploaded_at).not.toBeNull();
    const jobs = await sql<{ n: string }>(
      "select count(*) as n from pgmq.q_media_jobs where message->>'type' = 'process' and message->>'media_id' = $1",
      [mediaId],
    );
    expect(Number(jobs[0]?.n)).toBe(1);
  });

  it("acceptă finalizarea în marja de 15 minute și o respinge după", async () => {
    const event = await createTestEvent({ organizerEmail: randomEmail("org") });
    const session = await startSession(event.public_token);
    const inGrace = (await reserve(session, event.public_token, "image/jpeg", 100)).data?.[0];
    const late = (await reserve(session, event.public_token, "image/jpeg", 100)).data?.[0];

    await sql("update public.events set upload_starts_at = now() - interval '3 hours', upload_ends_at = now() - interval '10 minutes' where id = $1", [event.id]);
    await completeUpload(inGrace?.path ?? "", 50);
    await sql("update public.events set upload_ends_at = now() - interval '16 minutes' where id = $1", [event.id]);
    await completeUpload(late?.path ?? "", 50);

    const rows = await sql<{ id: string; status: string }>(
      "select id, status from public.media_items where id = any($1::uuid[])",
      [[inGrace?.media_id, late?.media_id]],
    );
    const status = Object.fromEntries(rows.map((r) => [r.id, r.status]));
    expect(status[inGrace?.media_id ?? ""]).toBe("uploaded");
    expect(status[late?.media_id ?? ""]).toBe("rejected");
  });
});

describe("guest_uploads (FR-016a, FR-022)", () => {
  it("întoarce doar fișierele sesiunii curente", async () => {
    const event = await createTestEvent({ organizerEmail: randomEmail("org") });
    const mine = await startSession(event.public_token);
    const theirs = await startSession(event.public_token);
    await reserve(mine, event.public_token, "image/jpeg", 10);
    await reserve(theirs, event.public_token, "image/jpeg", 10);
    const { data } = await service.rpc("guest_uploads", { p_session_id: mine });
    expect(data).toHaveLength(1);
    expect(data?.[0]?.status).toBe("reserved");
  });
});

// 002: stările noi ale evenimentului (FR-031, FR-032).
describe("evenimente neactivate, suspendate sau neconfirmate (002)", () => {
  async function awaitingEvent(): Promise<{ id: string; token: string }> {
    const event = await createTestEvent({ organizerEmail: randomEmail("guest-await") });
    await sql(
      `update public.events set status = 'awaiting_activation', upload_starts_at = null, upload_ends_at = null,
         base_price_minor = null, retention_option_id = null, activated_at = null,
         pending_purge_at = now() + interval '30 days' where id = $1`,
      [event.id],
    );
    return { id: event.id, token: event.public_token };
  }

  it("resolve_event_for_guest întoarce starea și numele pentru neactivat și suspendat", async () => {
    const awaiting = await awaitingEvent();
    expect(await resolve(awaiting.token)).toMatchObject({ state: "not_activated", name: "Nuntă de test" });

    const suspended = await createTestEvent({ organizerEmail: randomEmail("guest-susp") });
    await sql("select public.transition_event($1, 'suspended', 'admin')", [suspended.id]);
    expect(await resolve(suspended.public_token)).toMatchObject({ state: "suspended", name: "Nuntă de test" });

    const unconfirmed = await createTestEvent({ organizerEmail: randomEmail("guest-unconf") });
    await sql(
      `update public.events set status = 'unconfirmed', upload_starts_at = null, upload_ends_at = null,
         base_price_minor = null, retention_option_id = null where id = $1`,
      [unconfirmed.id],
    );
    expect(await resolve(unconfirmed.public_token)).toMatchObject({ state: "not_found", name: null });
  });

  it("sesiunea și rezervarea sunt refuzate cu coduri distincte", async () => {
    const awaiting = await awaitingEvent();
    const r1 = await service.rpc("start_guest_session", { p_token: awaiting.token, p_ip_hash: "x" });
    expect(r1.error?.message).toBe("EVENT_NOT_ACTIVATED");

    const event = await createTestEvent({ organizerEmail: randomEmail("guest-susp2") });
    const sessionId = await startSession(event.public_token);
    await sql("select public.transition_event($1, 'suspended', 'admin')", [event.id]);
    const r2 = await service.rpc("start_guest_session", { p_token: event.public_token, p_ip_hash: "x" });
    expect(r2.error?.message).toBe("EVENT_SUSPENDED");
    const r3 = await reserve(sessionId, event.public_token, "image/jpeg", 1000);
    expect(r3.error?.message).toBe("EVENT_SUSPENDED");
  });

  it("un fișier rezervat înainte de suspendare și finalizat după e respins cu EVENT_SUSPENDED", async () => {
    const event = await createTestEvent({ organizerEmail: randomEmail("guest-susp3") });
    const sessionId = await startSession(event.public_token);
    const { data, error } = await reserve(sessionId, event.public_token, "image/jpeg", 1000);
    expect(error).toBeNull();
    const reservation = data?.[0];
    await sql("select public.transition_event($1, 'suspended', 'admin')", [event.id]);
    await completeUpload(reservation?.path ?? "", 1000);
    const [row] = await sql<{ status: string; processing_error: string }>(
      "select status::text, processing_error from public.media_items where id = $1",
      [reservation?.media_id],
    );
    expect(row).toEqual({ status: "rejected", processing_error: "EVENT_SUSPENDED" });
  });
});
