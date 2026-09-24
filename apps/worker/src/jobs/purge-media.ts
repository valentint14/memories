import { query } from "../db.ts";
import { removePaths } from "../storage/purge-prefix.ts";
import type { JobHandler } from "./types.ts";

interface Row {
  id: string;
  status: string;
  incoming_path: string;
  original_path: string | null;
  display_path: string | null;
  thumb_path: string | null;
  playback_path: string | null;
}

/**
 * Șterge prin service role obiectele fișierelor `deleting` (apoi rândurile) și ale celor
 * `rejected` (rândul rămâne ca evidență). Idempotent (research.md R11).
 */
export const purgeMedia: JobHandler<{ type: "purge_media"; media_ids: string[] }> = {
  async run({ media_ids: ids }) {
    const rows = await query<Row>(
      `select id, status, incoming_path, original_path, display_path, thumb_path, playback_path
         from public.media_items where id = any($1::uuid[]) and status in ('deleting', 'rejected')`,
      [ids],
    );
    if (rows.length === 0) return;
    const media = rows.flatMap((r) =>
      [r.original_path, r.display_path, r.thumb_path, r.playback_path].filter((p): p is string => p !== null),
    );
    await removePaths("incoming", rows.map((r) => r.incoming_path));
    await removePaths("media", media);
    const deleting = rows.filter((r) => r.status === "deleting").map((r) => r.id);
    if (deleting.length > 0) {
      await query("delete from public.media_items where id = any($1::uuid[]) and status = 'deleting'", [deleting]);
    }
  },
};
