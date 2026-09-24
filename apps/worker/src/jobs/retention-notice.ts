import { config } from "../config.ts";
import { query } from "../db.ts";
import { sendMail } from "../email/transport.ts";
import { retentionNoticeEmail, type Threshold } from "../email/templates/retention-notice.ts";
import { log } from "../log.ts";
import type { JobHandler } from "./types.ts";

type Message = { type: "retention_notice"; event_id: string; threshold: Threshold; purge_at: string };

/**
 * Avertizarea dinaintea ștergerii automate (contracts/worker-jobs.md › retention_notice).
 * `sent_at` se setează imediat după accept-ul SMTP, înainte de arhivarea mesajului.
 */
export const retentionNotice: JobHandler<Message> = {
  async run({ event_id: eventId, threshold, purge_at: purgeAtIso }) {
    const [event] = await query<{ name: string | null; organizer_email: string | null; status: string; purge_at: Date }>(
      "select name, organizer_email, status, purge_at from public.events where id = $1",
      [eventId],
    );
    const messagePurge = new Date(purgeAtIso);
    // Evenimentul a fost prelungit, a expirat sau a fost șters: avertizarea nu mai e valabilă.
    if (!event || event.status !== "active" || event.purge_at.getTime() !== messagePurge.getTime()) return;
    if (event.name === null || event.organizer_email === null) return;

    const [notice] = await query<{ sent_at: Date | null }>(
      "select sent_at from public.retention_notices where event_id = $1 and threshold = $2 and purge_at = $3",
      [eventId, threshold, event.purge_at],
    );
    if (!notice || notice.sent_at !== null) return;

    const email = retentionNoticeEmail({
      eventName: event.name,
      purgeAt: event.purge_at,
      threshold,
      eventUrl: new URL(`/events/${eventId}`, config.appUrl).toString(),
    });
    await sendMail({ to: event.organizer_email, ...email });
    await query(
      "update public.retention_notices set sent_at = now() where event_id = $1 and threshold = $2 and purge_at = $3",
      [eventId, threshold, event.purge_at],
    );
    log.info({ job: "retention_notice", event_id: eventId, threshold, result: "ok" }, "avertizare trimisă");
  },

  async onFinalFailure({ event_id: eventId, threshold, purge_at: purgeAt }) {
    await query(
      "update public.retention_notices set failed_at = now() where event_id = $1 and threshold = $2 and purge_at = $3",
      [eventId, threshold, new Date(purgeAt)],
    );
  },
};
