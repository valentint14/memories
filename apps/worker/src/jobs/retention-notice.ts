import { config } from "../config.ts";
import { query } from "../db.ts";
import { sendMail } from "../email/transport.ts";
import { retentionNoticeEmail, type Threshold } from "../email/templates/retention-notice.ts";
import { unactivatedNoticeEmail } from "../email/templates/stergere-neactivat.ts";
import { log } from "../log.ts";
import type { JobHandler } from "./types.ts";

type Message = { type: "retention_notice"; event_id: string; threshold: Threshold | "activation_7d"; purge_at: string };

/** Marchează avertizarea ca trimisă, imediat după accept-ul SMTP. */
async function markSent(eventId: string, threshold: string, purgeAt: Date): Promise<void> {
  await query("update public.retention_notices set sent_at = now() where event_id = $1 and threshold = $2 and purge_at = $3", [
    eventId,
    threshold,
    purgeAt,
  ]);
}

async function noticePending(eventId: string, threshold: string, purgeAt: Date): Promise<boolean> {
  const [notice] = await query<{ sent_at: Date | null }>(
    "select sent_at from public.retention_notices where event_id = $1 and threshold = $2 and purge_at = $3",
    [eventId, threshold, purgeAt],
  );
  return notice !== undefined && notice.sent_at === null;
}

/** Evenimentul neactivat se șterge în 7 zile (002: FR-019); data poate să se fi mutat între timp. */
async function unactivatedNotice(eventId: string, purgeAtIso: string): Promise<void> {
  const [event] = await query<{ name: string; organizer_email: string; status: string; pending_purge_at: Date | null; price_minor: string }>(
    `select e.name, e.organizer_email::text, e.status, e.pending_purge_at, p.price_minor
       from public.events e, public.packages p
      where e.id = $1 and p.code = 'complete'`,
    [eventId],
  );
  const purgeAt = new Date(purgeAtIso);
  if (!event || event.status !== "awaiting_activation" || event.pending_purge_at?.getTime() !== purgeAt.getTime()) return;
  if (!(await noticePending(eventId, "activation_7d", purgeAt))) return;

  const email = unactivatedNoticeEmail({
    eventName: event.name,
    purgeAt,
    priceMinor: Number(event.price_minor),
    eventUrl: new URL(`/events/${eventId}`, config.appUrl).toString(),
  });
  await sendMail({ to: event.organizer_email, ...email });
  await markSent(eventId, "activation_7d", purgeAt);
  log.info({ job: "retention_notice", event_id: eventId, threshold: "activation_7d", result: "ok" }, "avertizare trimisă");
}

/**
 * Avertizarea dinaintea ștergerii automate (contracts/worker-jobs.md › retention_notice).
 * `sent_at` se setează imediat după accept-ul SMTP, înainte de arhivarea mesajului.
 */
export const retentionNotice: JobHandler<Message> = {
  async run({ event_id: eventId, threshold, purge_at: purgeAtIso }) {
    if (threshold === "activation_7d") {
      await unactivatedNotice(eventId, purgeAtIso);
      return;
    }
    const [event] = await query<{ name: string | null; organizer_email: string | null; status: string; purge_at: Date | null }>(
      "select name, organizer_email, status, purge_at from public.events where id = $1",
      [eventId],
    );
    const messagePurge = new Date(purgeAtIso);
    // Evenimentul a fost prelungit, a expirat sau a fost șters: avertizarea nu mai e valabilă.
    if (!event?.purge_at || event.status !== "active" || event.purge_at.getTime() !== messagePurge.getTime()) return;
    if (event.name === null || event.organizer_email === null) return;

    if (!(await noticePending(eventId, threshold, event.purge_at))) return;

    const email = retentionNoticeEmail({
      eventName: event.name,
      purgeAt: event.purge_at,
      threshold,
      eventUrl: new URL(`/events/${eventId}`, config.appUrl).toString(),
    });
    await sendMail({ to: event.organizer_email, ...email });
    await markSent(eventId, threshold, event.purge_at);
    log.info({ job: "retention_notice", event_id: eventId, threshold, result: "ok" }, "avertizare trimisă");
  },

  async onFinalFailure({ event_id: eventId, threshold, purge_at: purgeAt }) {
    await query(
      "update public.retention_notices set failed_at = now() where event_id = $1 and threshold = $2 and purge_at = $3",
      [eventId, threshold, new Date(purgeAt)],
    );
  },
};
