import { query } from "../db.ts";
import { purgePrefix } from "../storage/purge-prefix.ts";
import type { JobHandler } from "./types.ts";

/**
 * Ștergerea automată la termen (FR-044): golește Storage-ul evenimentului, apoi păstrează doar
 * rândul de facturare (complete_event_expiry). Idempotent: `expired` = deja terminat.
 */
export const expireEvent: JobHandler<{ type: "expire_event"; event_id: string }> = {
  async run({ event_id: eventId }) {
    const [event] = await query<{ status: string }>("select status from public.events where id = $1", [eventId]);
    if (event?.status !== "expiring") return;
    await purgePrefix(eventId, ["incoming", "media", "archives"]);
    await query("select public.complete_event_expiry($1)", [eventId]);
  },
};
