import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { query } from "../db.ts";
import { log } from "../log.ts";
import { detectType, extensionOf } from "../media/detect.ts";
import { makePhotoVariants } from "../media/photo.ts";
import { hasLocationTags, sanitizeInPlace } from "../media/sanitize.ts";
import { makePlayback, makePoster, probeVideo } from "../media/video.ts";
import { removePaths } from "../storage/purge-prefix.ts";
import { downloadToFile, uploadObject } from "../storage/transfer.ts";
import type { JobHandler } from "./types.ts";

interface MediaRow {
  id: string;
  event_id: string;
  guest_session_id: string;
  kind: "photo" | "video";
  status: string;
  incoming_path: string;
  max_photo_bytes: string;
  max_video_bytes: string;
}

/** Respinge fișierul: obiect șters, rând `rejected`, limita invitatului eliberată (FR-017). */
async function reject(row: MediaRow, reason: string): Promise<void> {
  await removePaths("incoming", [row.incoming_path]);
  await query(
    `with m as (
       update public.media_items set status = 'rejected', processing_error = $2
        where id = $1 and status in ('uploaded', 'processing') returning guest_session_id
     )
     update public.guest_sessions s set files_reserved = greatest(files_reserved - 1, 0)
       from m where s.id = m.guest_session_id`,
    [row.id, reason],
  );
  log.info({ job: "process", media_id: row.id, result: "ok", error_code: reason }, "fișier respins");
}

async function markFailed(mediaId: string, reason: string): Promise<void> {
  await query(
    "update public.media_items set status = 'failed', processing_error = $2 where id = $1 and status in ('uploaded', 'processing')",
    [mediaId, reason],
  );
}

/**
 * Procesarea unui fișier încărcat (contracts/worker-jobs.md › process, pașii 1–7).
 * Idempotent: fișierele deja finalizate (ready/failed/rejected/deleting) se ignoră.
 */
export const processMedia: JobHandler<{ type: "process"; media_id: string }> = {
  async run({ media_id: mediaId }, ctx) {
    const [row] = await query<MediaRow>(
      `update public.media_items m set status = 'processing'
         from public.events e
        where m.id = $1 and e.id = m.event_id and m.status in ('uploaded', 'processing')
        returning m.id, m.event_id, m.guest_session_id, m.kind, m.status, m.incoming_path,
                  e.max_photo_bytes, e.max_video_bytes`,
      [mediaId],
    );
    if (!row) return;
    if (row.kind === "video") await ctx.extendVisibility(900);

    const work = await mkdtemp(join(tmpdir(), "media-"));
    try {
      const source = join(work, "source");
      await downloadToFile("incoming", row.incoming_path, source);

      // 2. Tipul real
      const detected = await detectType(source, row.kind);
      if (!detected.ok) {
        await reject(row, detected.reason);
        return;
      }

      // 3. Dimensiunea reală
      const { size } = await stat(source);
      const max = Number(row.kind === "photo" ? row.max_photo_bytes : row.max_video_bytes);
      if (size > max) {
        await reject(row, "TOO_LARGE");
        return;
      }

      // 4–5. Curățarea metadatelor și verificarea (FR-023, SC-009). Un fișier pe care ExifTool
      // nu-l poate rescrie (ex. JPEG trunchiat) se servește doar dacă nu conține deloc locație.
      try {
        await sanitizeInPlace(source, row.kind);
      } catch (error) {
        log.warn({ job: "process", media_id: row.id, error_code: error instanceof Error ? error.name : "UNKNOWN" }, "curățare imposibilă");
      }
      if (await hasLocationTags(source)) {
        await markFailed(row.id, "LOCATION_NOT_REMOVED");
        await removePaths("incoming", [row.incoming_path]);
        return;
      }

      const prefix = `${row.event_id}/${row.id}`;
      const originalPath = `${prefix}/original.${extensionOf(detected.mime)}`;
      await uploadObject("media", originalPath, { path: source }, detected.mime);

      // 6. Variante
      let displayPath: string | null = null;
      let thumbPath: string | null = null;
      let playbackPath: string | null = null;
      let width: number | null = null;
      let height: number | null = null;
      let durationMs: number | null = null;

      if (row.kind === "photo") {
        const variants = await makePhotoVariants(source, detected.mime);
        if (variants) {
          displayPath = `${prefix}/display.webp`;
          thumbPath = `${prefix}/thumb.webp`;
          await uploadObject("media", displayPath, variants.display, "image/webp");
          await uploadObject("media", thumbPath, variants.thumb, "image/webp");
          width = variants.width;
          height = variants.height;
        }
      } else {
        try {
          const info = await probeVideo(source);
          ({ width, height, durationMs } = info);
          const poster = await makePoster(source, work, info.durationMs);
          thumbPath = `${prefix}/poster.webp`;
          await uploadObject("media", thumbPath, poster, "image/webp");
          const playback = join(work, "playback.mp4");
          await makePlayback(source, playback);
          playbackPath = `${prefix}/playback.mp4`;
          await uploadObject("media", playbackPath, { path: playback }, "video/mp4");
        } catch (error) {
          // Video nedecodabil: originalul curățat rămâne descărcabil, fără previzualizare.
          log.warn({ job: "process", media_id: row.id, error_code: error instanceof Error ? error.name : "UNKNOWN" }, "video fără previzualizare");
          thumbPath = null;
          playbackPath = null;
        }
      }

      // 7. Finalizare
      await query(
        `update public.media_items set status = 'ready', detected_mime = $2, actual_bytes = $3,
            original_path = $4, display_path = $5, thumb_path = $6, playback_path = $7,
            width = $8, height = $9, duration_ms = $10, processing_error = null
          where id = $1 and status = 'processing'`,
        [row.id, detected.mime, size, originalPath, displayPath, thumbPath, playbackPath, width, height, durationMs],
      );
      await removePaths("incoming", [row.incoming_path]);
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  },

  async onFinalFailure({ media_id: mediaId }) {
    await markFailed(mediaId, "PROCESSING_FAILED");
  },
};
