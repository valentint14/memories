/**
 * Performanța arhivei (SC-010, amendat): pentru un eveniment cu 1.000 de fișiere (≈ 10 GB),
 * arhiva e gata în ≤ 15 minute, iar descărcarea începe în < 10 s de la click; conținutul e
 * verificat prin sume de control. Rulat pe preview (necesită worker-ul pornit acolo):
 *
 *   DATABASE_URL=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     node tests/perf/archive-1000.ts            # FILES=1000 SIZE_MB=10 implicit
 *
 * Validare locală rapidă: FILES=20 SIZE_MB=1 node --env-file=apps/worker/.env tests/perf/archive-1000.ts
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdtemp, open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";

const FILES = Number(process.env.FILES ?? 1000);
const SIZE = Number(process.env.SIZE_MB ?? 10) * 1024 * 1024;
const READY_LIMIT_MS = 15 * 60_000;
const FIRST_BYTE_LIMIT_MS = 10_000;

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Lipsește ${name}`);
  return v;
}

const supabase = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
const db = new pg.Pool({ connectionString: env("DATABASE_URL"), max: 4 });

async function seed(): Promise<{ eventId: string; checksums: Map<string, string> }> {
  const now = Date.now();
  const [option] = (await db.query<{ id: string }>("select id from public.retention_options where months = 3")).rows;
  const [event] = (
    await db.query<{ id: string }>(
      `insert into public.events (name, event_date, organizer_email, upload_starts_at, upload_ends_at, base_price_minor, retention_option_id)
       values ('Test performanță arhivă', current_date, 'perf@example.test', $1, $2, 0, $3) returning id`,
      [new Date(now - 3_600_000), new Date(now + 86_400_000), option?.id],
    )
  ).rows;
  if (!event) throw new Error("eveniment necreat");
  const [session] = (await db.query<{ id: string }>("insert into public.guest_sessions (event_id) values ($1) returning id", [event.id])).rows;

  const checksums = new Map<string, string>();
  const base = randomBytes(SIZE);
  let done = 0;
  const queue = Array.from({ length: FILES }, (_, i) => i);
  await Promise.all(
    Array.from({ length: 8 }, async () => {
      for (let i = queue.shift(); i !== undefined; i = queue.shift()) {
        const id = randomUUID();
        const body = Buffer.from(base);
        body.writeUInt32BE(i, 0); // fiecare fișier diferit, fără a genera 10 GB aleatori
        body.set([0xff, 0xd8, 0xff, 0xe0], 4);
        const path = `${event.id}/${id}/original.jpg`;
        const { error } = await supabase.storage.from("media").upload(path, body, { contentType: "image/jpeg" });
        if (error) throw error;
        checksums.set(id.slice(0, 8), createHash("sha256").update(body).digest("hex"));
        await db.query(
          `insert into public.media_items (id, event_id, guest_session_id, kind, declared_mime, detected_mime, original_filename,
             declared_bytes, actual_bytes, incoming_path, status, original_path, uploaded_at)
           values ($1::uuid, $2::uuid, $3, 'photo', 'image/jpeg', 'image/jpeg', 'x.jpg', $4, $4, $2::text || '/' || $1::text, 'ready', $5,
                   now() + make_interval(secs => $6))`,
          [id, event.id, session?.id, SIZE, path, i],
        );
        done += 1;
        if (done % 50 === 0) console.log(`seed: ${String(done)}/${String(FILES)}`);
      }
    }),
  );
  return { eventId: event.id, checksums };
}

/** Sumele de control ale intrărilor, din directorul central (intrări STORE). */
async function verifyZip(file: string, expected: Map<string, string>): Promise<number> {
  const handle = await open(file, "r");
  try {
    const { size } = await handle.stat();
    const tail = Buffer.alloc(Math.min(size, 1024 * 1024));
    await handle.read(tail, 0, tail.length, size - tail.length);
    // ZIP64: citim offset-ul directorului central din EOCD64 dacă există.
    const eocd64 = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x06, 0x06]));
    const eocd = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    const cdOffset = eocd64 >= 0 ? Number(tail.readBigUInt64LE(eocd64 + 48)) : tail.readUInt32LE(eocd + 16);
    const cdSize = eocd64 >= 0 ? Number(tail.readBigUInt64LE(eocd64 + 40)) : tail.readUInt32LE(eocd + 12);
    const cd = Buffer.alloc(cdSize);
    await handle.read(cd, 0, cdSize, cdOffset);

    let pos = 0;
    let verified = 0;
    while (pos < cd.length && cd.readUInt32LE(pos) === 0x02014b50) {
      let compressed = cd.readUInt32LE(pos + 20);
      const nameLen = cd.readUInt16LE(pos + 28);
      const extraLen = cd.readUInt16LE(pos + 30);
      const commentLen = cd.readUInt16LE(pos + 32);
      let localOffset = cd.readUInt32LE(pos + 42);
      const name = cd.subarray(pos + 46, pos + 46 + nameLen).toString("utf8");
      // Câmpurile ZIP64 (0xFFFFFFFF) sunt în extra-ul 0x0001.
      const extra = cd.subarray(pos + 46 + nameLen, pos + 46 + nameLen + extraLen);
      if (extra.length >= 4 && extra.readUInt16LE(0) === 0x0001) {
        let e = 4;
        if (cd.readUInt32LE(pos + 24) === 0xffffffff) e += 8;
        if (compressed === 0xffffffff) {
          compressed = Number(extra.readBigUInt64LE(e));
          e += 8;
        }
        if (localOffset === 0xffffffff) localOffset = Number(extra.readBigUInt64LE(e));
      }
      const local = Buffer.alloc(30);
      await handle.read(local, 0, 30, localOffset);
      const dataStart = localOffset + 30 + local.readUInt16LE(26) + local.readUInt16LE(28);
      const data = Buffer.alloc(compressed);
      await handle.read(data, 0, compressed, dataStart);
      const shortId = /_([0-9a-f]{8})\.jpg$/.exec(name)?.[1] ?? "";
      if (expected.get(shortId) !== createHash("sha256").update(data).digest("hex")) throw new Error(`sumă de control greșită: ${name}`);
      verified += 1;
      pos += 46 + nameLen + extraLen + commentLen;
    }
    return verified;
  } finally {
    await handle.close();
  }
}

const { eventId, checksums } = await seed();
const requested = Date.now();
const [job] = (await db.query<{ id: string }>("insert into public.archive_jobs (event_id, status) values ($1, 'pending') returning id", [eventId])).rows;
await db.query("select pgmq.send('media_jobs', jsonb_build_object('type', 'build_archive', 'archive_job_id', $1::uuid))", [job?.id]);

let readyMs: number;
for (;;) {
  const [row] = (await db.query<{ status: string; archive_path: string | null }>("select status, archive_path from public.archive_jobs where id = $1", [job?.id])).rows;
  if (row?.status === "ready" && row.archive_path) {
    readyMs = Date.now() - requested;
    break;
  }
  if (row?.status === "failed") throw new Error("arhiva a eșuat");
  if (Date.now() - requested > READY_LIMIT_MS * 2) throw new Error("timp depășit");
  await new Promise((r) => setTimeout(r, 2000));
}

const [row] = (await db.query<{ archive_path: string }>("select archive_path from public.archive_jobs where id = $1", [job?.id])).rows;
const signed = await supabase.storage.from("archives").createSignedUrl(row?.archive_path ?? "", 900);
if (signed.error) throw signed.error;
const clicked = Date.now();
const res = await fetch(signed.data.signedUrl);
if (!res.ok || !res.body) throw new Error(`descărcare ${String(res.status)}`);
const firstByteMs = Date.now() - clicked;

const dir = await mkdtemp(join(tmpdir(), "perf-"));
const zip = join(dir, "arhiva.zip");
await pipeline(Readable.fromWeb(res.body), createWriteStream(zip));
const verified = await verifyZip(zip, checksums);
await rm(dir, { recursive: true, force: true });

console.log(`fișiere: ${String(FILES)} × ${String(SIZE / 1024 / 1024)} MB`);
console.log(`arhivă gata în ${(readyMs / 1000).toFixed(1)} s (limită ${String(READY_LIMIT_MS / 1000)} s)`);
console.log(`primul octet după click: ${String(firstByteMs)} ms (limită ${String(FIRST_BYTE_LIMIT_MS)} ms)`);
console.log(`intrări verificate: ${String(verified)}/${String(FILES)}`);

// Curățenie: evenimentul de test se șterge prin fluxul normal (worker purge_event).
await db.query("update public.events set status = 'deleting' where id = $1", [eventId]);
await db.query("select pgmq.send('media_jobs', jsonb_build_object('type', 'purge_event', 'event_id', $1::uuid))", [eventId]);
await db.end();

const ok = readyMs <= READY_LIMIT_MS && firstByteMs < FIRST_BYTE_LIMIT_MS && verified === FILES;
console.log(ok ? "SC-010: TRECUT" : "SC-010: EȘUAT");
process.exit(ok ? 0 : 1);
