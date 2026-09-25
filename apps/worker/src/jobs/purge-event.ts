import { query } from "../db.ts";
import { sendMessage } from "../queue.ts";
import { purgePrefix } from "../storage/purge-prefix.ts";
import type { JobHandler } from "./types.ts";

/**
 * Ștergerea definitivă a unui eveniment (001/FR-006b): golește prefixele din Storage, șterge
 * rândurile în cascadă și, dacă organizatorul nu mai are evenimente, cere ștergerea contului.
 * Ștergerea cerută de organizator a unui eveniment activat păstrează rândul de facturare (002/FR-035).
 */
export const purgeEvent: JobHandler<{ type: "purge_event"; event_id: string }> = {
  async run({ event_id: eventId }) {
    const [event] = await query<{ status: string; organizer_email: string | null; deletion_keeps_billing: boolean }>(
      "select status, organizer_email, deletion_keeps_billing from public.events where id = $1",
      [eventId],
    );
    // Rândul lipsește: o rulare anterioară a terminat deja (idempotent).
    if (!event) {
      await purgePrefix(eventId, ["incoming", "media", "archives"]);
      return;
    }
    if (event.status !== "deleting") return;

    await purgePrefix(eventId, ["incoming", "media", "archives"]);
    if (event.deletion_keeps_billing) {
      await query("select public.complete_event_expiry($1)", [eventId]);
      return;
    }
    await query("delete from public.events where id = $1", [eventId]);

    if (event.organizer_email !== null) {
      const [orphan] = await query<{ id: string | null }>("select public.orphan_organizer_user_id($1) as id", [
        event.organizer_email,
      ]);
      if (orphan?.id) await sendMessage({ type: "delete_organizer_user", user_id: orphan.id });
    }
  },
};
