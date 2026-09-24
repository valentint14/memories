import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { query } from "../src/db.ts";
import { buildArchive } from "../src/jobs/build-archive.ts";
import { supabase } from "../src/storage/client.ts";
import { createEvent, ctx, randomEmail } from "./support.ts";

/** Fișiere „gata” (originalul în bucket-ul media) + opțional fișiere încă neprocesate. */
async function seed(ready: number, notReady: number): Promise<{ eventId: string; jobId: string }> {
  const event = await createEvent({ organizerEmail: randomEmail("org") });
  const [session] = await query<{ id: string }>("insert into public.guest_sessions (event_id) values ($1) returning id", [event.id]);
  for (let i = 0; i < ready + notReady; i++) {
    const id = randomUUID();
    const isReady = i < ready;
    const original = `${event.id}/${id}/original.jpg`;
    if (isReady) {
      const { error } = await supabase().storage.from("media").upload(original, Buffer.from(`fișier ${String(i)}`), { contentType: "image/jpeg" });
      if (error) throw error;
    }
    await query(
      `insert into public.media_items (id, event_id, guest_session_id, guest_name, kind, declared_mime, detected_mime,
         original_filename, declared_bytes, incoming_path, status, original_path, uploaded_at)
       values ($1::uuid, $2::uuid, $3, $4, 'photo', 'image/jpeg', 'image/jpeg', 'x.jpg', 10, $2::text || '/' || $1::text, $5::public.media_status, $6,
               now() + make_interval(secs => $7))`,
      [id, event.id, session?.id, i % 2 === 0 ? "Ana" : null, isReady ? "ready" : "processing", isReady ? original : null, i],
    );
  }
  const [job] = await query<{ id: string }>("insert into public.archive_jobs (event_id, status) values ($1, 'pending') returning id", [event.id]);
  return { eventId: event.id, jobId: job?.id ?? "" };
}

/** Numele intrărilor din directorul central al unui ZIP (semnătura PK\x01\x02). */
function zipEntries(zip: Buffer): { names: string[]; methods: number[] } {
  const names: string[] = [];
  const methods: number[] = [];
  let offset = zip.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  while (offset !== -1 && offset < zip.length) {
    methods.push(zip.readUInt16LE(offset + 10));
    const nameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    names.push(zip.subarray(offset + 46, offset + 46 + nameLength).toString("utf8"));
    offset = zip.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]), offset + 46 + nameLength + extraLength + commentLength);
  }
  return { names, methods };
}

describe("build_archive (FR-030, research.md R9)", () => {
  it("arhivează doar fișierele gata, fără recomprimare, cu nume unice, și numără fișierele neincluse", async () => {
    const { eventId, jobId } = await seed(3, 1);
    await buildArchive.run({ type: "build_archive", archive_job_id: jobId }, ctx);

    const [job] = await query<{ status: string; file_count: number; skipped_count: number; archive_path: string; expires_at: Date }>(
      "select status, file_count, skipped_count, archive_path, expires_at from public.archive_jobs where id = $1",
      [jobId],
    );
    expect(job?.status).toBe("ready");
    expect(job?.file_count).toBe(3);
    expect(job?.skipped_count).toBe(1);
    expect(job?.archive_path).toBe(`${eventId}/${jobId}.zip`);
    expect(job?.expires_at.getTime()).toBeGreaterThan(Date.now() + 23 * 3_600_000);

    const { data, error } = await supabase().storage.from("archives").download(job?.archive_path ?? "");
    if (error) throw error;
    const { names, methods } = zipEntries(Buffer.from(await data.arrayBuffer()));
    expect(names).toHaveLength(3);
    expect(new Set(names).size).toBe(3);
    expect(names[0]).toMatch(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}_Ana_[0-9a-f]{8}\.jpg$/);
    expect(names[1]).toMatch(/_anonim_/);
    expect(methods.every((m) => m === 0)).toBe(true);
  });

  it("se oprește și șterge arhiva parțială dacă jobul expiră între timp (o ștergere de fișiere)", async () => {
    const { eventId, jobId } = await seed(60, 0);
    const running = buildArchive.run({ type: "build_archive", archive_job_id: jobId }, ctx);
    // Așteptăm să înceapă construirea, apoi o invalidăm ca `delete_media`.
    for (let i = 0; i < 100; i++) {
      const [row] = await query<{ status: string }>("select status from public.archive_jobs where id = $1", [jobId]);
      if (row?.status === "building") break;
      await new Promise((r) => setTimeout(r, 20));
    }
    await query("update public.archive_jobs set status = 'expired' where id = $1", [jobId]);
    await running;

    const [job] = await query<{ status: string }>("select status from public.archive_jobs where id = $1", [jobId]);
    expect(job?.status).toBe("expired");
    const { data } = await supabase().storage.from("archives").list(eventId);
    expect(data ?? []).toEqual([]);
  });

  it("ignoră un job care nu mai e în așteptare (idempotent)", async () => {
    const { jobId } = await seed(1, 0);
    await query("update public.archive_jobs set status = 'expired' where id = $1", [jobId]);
    await expect(buildArchive.run({ type: "build_archive", archive_job_id: jobId }, ctx)).resolves.toBeUndefined();
  });
});
