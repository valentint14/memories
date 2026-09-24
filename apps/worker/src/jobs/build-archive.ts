import { Readable } from "node:stream";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { archiveEntryName, uniqueEntryNames } from "@memories/shared";
import yazl from "yazl";
import { query } from "../db.ts";
import { log } from "../log.ts";
import { s3 } from "../storage/client.ts";
import { removePaths } from "../storage/purge-prefix.ts";
import type { JobHandler } from "./types.ts";

interface Entry {
  id: string;
  original_path: string;
  guest_name: string | null;
  uploaded_at: Date;
}

const EXTENSION = /\.([a-z0-9]+)$/i;

async function jobStatus(jobId: string): Promise<string | undefined> {
  const [row] = await query<{ status: string }>("select status from public.archive_jobs where id = $1", [jobId]);
  return row?.status;
}

/**
 * Arhiva ZIP a evenimentului, în streaming (principiul IV, research.md R9): fiecare original e
 * citit din S3 doar când îi vine rândul, scris ca STORE (media e deja comprimată) și încărcat
 * multipart în `archives/{event}/{job}.zip`. Nicio arhivă completă în memorie sau pe disc.
 */
export const buildArchive: JobHandler<{ type: "build_archive"; archive_job_id: string }> = {
  async run({ archive_job_id: jobId }, ctx) {
    const [job] = await query<{ event_id: string }>(
      "update public.archive_jobs set status = 'building' where id = $1 and status in ('pending', 'building') returning event_id",
      [jobId],
    );
    if (!job) return;
    await ctx.extendVisibility(900);

    const entries = await query<Entry>(
      `select id, original_path, guest_name, uploaded_at from public.media_items
        where event_id = $1 and status = 'ready' and original_path is not null
        order by uploaded_at, id`,
      [job.event_id],
    );
    const [skipped] = await query<{ n: number }>(
      "select count(*)::int as n from public.media_items where event_id = $1 and status in ('uploaded', 'processing', 'failed')",
      [job.event_id],
    );

    const names = uniqueEntryNames(
      entries.map((e) =>
        archiveEntryName({
          uploadedAt: e.uploaded_at.toISOString(),
          guestName: e.guest_name,
          id: e.id,
          extension: EXTENSION.exec(e.original_path)?.[1] ?? "bin",
        }),
      ),
    );

    const key = `${job.event_id}/${jobId}.zip`;
    const zip = new yazl.ZipFile();
    let totalBytes = 0;
    let lastHeartbeat = Date.now();

    entries.forEach((entry, i) => {
      zip.addReadStreamLazy(names[i] ?? `${entry.id}.bin`, { compress: false, mtime: entry.uploaded_at }, (cb) => {
        void (async () => {
          try {
            // Jobul invalidat de o ștergere de fișiere → oprim arhivarea.
            if ((await jobStatus(jobId)) !== "building") {
              cb(new Error("ARCHIVE_ABORTED"), Readable.from([]));
              return;
            }
            if (Date.now() - lastHeartbeat > 60_000) {
              lastHeartbeat = Date.now();
              await ctx.extendVisibility(900);
            }
            const res = await s3().send(new GetObjectCommand({ Bucket: "media", Key: entry.original_path }));
            if (!(res.Body instanceof Readable)) throw new Error("corp S3 neașteptat");
            totalBytes += res.ContentLength ?? 0;
            cb(null, res.Body);
          } catch (error) {
            cb(error instanceof Error ? error : new Error(String(error)), Readable.from([]));
          }
        })();
      });
    });
    // ZIP64 se activează automat când o intrare sau arhiva depășește 4 GB.
    zip.end();

    const upload = new Upload({
      client: s3(),
      // `outputStream` e un PassThrough Node (tipurile @types/yazl îl declară generic).
      params: { Bucket: "archives", Key: key, Body: zip.outputStream as Readable, ContentType: "application/zip" },
      partSize: 16 * 1024 * 1024,
      queueSize: 2,
    });

    // yazl emite erorile (anulare, citire eșuată) pe ZipFile, iar fluxul de ieșire rămâne deschis:
    // îl închidem cu eroare și oprim uploadul multipart, ca `upload.done()` să se termine.
    zip.on("error", (error: Error) => {
      void upload.abort();
      (zip.outputStream as Readable).destroy(error);
    });

    try {
      await upload.done();
    } catch (error) {
      await removePaths("archives", [key]).catch(() => undefined);
      if ((await jobStatus(jobId)) !== "building") {
        log.info({ job: "build_archive", archive_job_id: jobId, result: "skipped" }, "arhivă anulată");
        return;
      }
      throw error;
    }

    const updated = await query(
      `update public.archive_jobs
          set status = 'ready', archive_path = $2, file_count = $3, skipped_count = $4, total_bytes = $5,
              completed_at = now(), expires_at = now() + interval '24 hours'
        where id = $1 and status = 'building' returning id`,
      [jobId, key, entries.length, skipped?.n ?? 0, totalBytes],
    );
    if (updated.length === 0) await removePaths("archives", [key]);
  },

  async onFinalFailure({ archive_job_id: jobId }) {
    await query("update public.archive_jobs set status = 'failed' where id = $1 and status in ('pending', 'building')", [jobId]);
  },
};
