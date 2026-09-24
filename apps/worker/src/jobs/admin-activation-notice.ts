import { config } from "../config.ts";
import { query } from "../db.ts";
import { activationRequestEmail } from "../email/templates/activare-solicitata.ts";
import { sendMail } from "../email/transport.ts";
import { log } from "../log.ts";
import type { JobHandler } from "./types.ts";

/** Anunță administratorii că un organizator a cerut activarea (002/FR-018a). */
export const adminActivationNotice: JobHandler<{ type: "admin_activation_notice"; event_id: string }> = {
  async run({ event_id: eventId }) {
    const [event] = await query<{ name: string; event_date: string; organizer_email: string; requested_at: Date }>(
      `select e.name, e.event_date::text, e.organizer_email::text, r.requested_at
         from public.events e
         join lateral (
           select requested_at from public.activation_requests where event_id = e.id order by requested_at desc limit 1
         ) r on true
        where e.id = $1 and e.status = 'awaiting_activation'`,
      [eventId],
    );
    if (!event) return;

    let recipients = config.adminNotifyEmails;
    if (recipients.length === 0) {
      const admins = await query<{ email: string }>(
        "select u.email from public.platform_admins p join auth.users u on u.id = p.user_id where u.email is not null",
      );
      recipients = admins.map((a) => a.email);
    }
    if (recipients.length === 0) {
      log.warn({ job: "admin_activation_notice", event_id: eventId }, "niciun administrator de anunțat");
      return;
    }

    const mail = activationRequestEmail({
      eventName: event.name,
      eventDate: event.event_date,
      organizerEmail: event.organizer_email,
      requestedAt: event.requested_at,
      adminUrl: new URL(`/admin/events/${eventId}`, config.appUrl).toString(),
    });
    await sendMail({ to: recipients.join(", "), ...mail });
    log.info({ job: "admin_activation_notice", event_id: eventId, result: "sent" }, "cerere de activare anunțată");
  },
};
