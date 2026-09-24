import { query } from "../db.ts";
import { purgePrefix, removePaths } from "../storage/purge-prefix.ts";
import type { JobHandler } from "./types.ts";

interface Row {
  id: string;
  event_id: string;
  status: string;
  incoming_path: string;
}

/**
 * Curățarea fișierelor șterse sau respinse (research.md R11). Se golește tot prefixul
 * `{event}/{media}/` din `media` — inclusiv variante produse de o procesare încă în curs la
 * momentul ștergerii — și obiectul din `incoming`. Rândurile `deleting` se șterg; cele
 * `rejected` rămân ca evidență. Idempotent: rândurile deja șterse se curăță după `event_id`.
 */
export const purgeMedia: JobHandler<{ type: "purge_media"; media_ids: string[]; event_id?: string }> = {
  async run({ media_ids: ids, event_id: eventId }) {
    const rows = await query<Row>(
      "select id, event_id, status, incoming_path from public.media_items where id = any($1::uuid[]) and status in ('deleting', 'rejected')",
      [ids],
    );
    const known = new Set(rows.map((r) => r.id));
    const targets = [
      ...rows.map((r) => ({ id: r.id, eventId: r.event_id, incoming: r.incoming_path })),
      // Rânduri deja finalizate de organizator: curățăm după prefixul cunoscut.
      ...(eventId ? ids.filter((id) => !known.has(id)).map((id) => ({ id, eventId, incoming: `${eventId}/${id}` })) : []),
    ];

    for (const t of targets) {
      await purgePrefix(`${t.eventId}/${t.id}`, ["media"]);
    }
    await removePaths("incoming", targets.map((t) => t.incoming));

    const deleting = rows.filter((r) => r.status === "deleting").map((r) => r.id);
    if (deleting.length > 0) {
      await query("delete from public.media_items where id = any($1::uuid[]) and status = 'deleting'", [deleting]);
    }
  },
};
