import { config } from "../config.ts";
import { query } from "../db.ts";
import { adminPaymentNoticeEmail } from "../email/templates/plata-de-verificat.ts";
import { sendMail } from "../email/transport.ts";
import { log } from "../log.ts";
import type { JobHandler, JobMessage } from "./types.ts";

type Message = Extract<JobMessage, { type: "admin_payment_notice" }>;

/** Anunță administratorii despre o plată de rambursat sau contestată (003: FR-011, FR-016a). */
export const adminPaymentNotice: JobHandler<Message> = {
  async run({ payment_id: paymentId, reason }) {
    const [payment] = await query<{
      event_id: string | null;
      event_name: string | null;
      organizer_email: string | null;
      amount_minor: string;
      paid_at: Date | null;
      reference: string | null;
      event_exists: boolean;
    }>(
      `select p.event_id, p.event_name, p.organizer_email::text, p.amount_minor, p.paid_at,
              coalesce(p.stripe_payment_intent_id, p.stripe_session_id) as reference,
              exists (select 1 from public.events e where e.id = p.event_id) as event_exists
         from public.payments p where p.id = $1`,
      [paymentId],
    );
    if (!payment) return;

    let recipients = config.adminNotifyEmails;
    if (recipients.length === 0) {
      const admins = await query<{ email: string }>(
        "select u.email from public.platform_admins p join auth.users u on u.id = p.user_id where u.email is not null",
      );
      recipients = admins.map((a) => a.email);
    }
    if (recipients.length === 0) {
      log.warn({ job: "admin_payment_notice", payment_id: paymentId }, "niciun administrator de anunțat");
      return;
    }

    const mail = adminPaymentNoticeEmail({
      reason,
      eventName: payment.event_name ?? "—",
      eventExists: payment.event_exists,
      organizerEmail: payment.organizer_email ?? "—",
      amountMinor: Number(payment.amount_minor),
      paidAt: payment.paid_at,
      reference: payment.reference ?? "—",
      adminUrl: payment.event_exists && payment.event_id !== null ? new URL(`/admin/events/${payment.event_id}`, config.appUrl).toString() : null,
    });
    await sendMail({ to: recipients.join(", "), ...mail });
    log.info({ job: "admin_payment_notice", payment_id: paymentId, reason, result: "sent" }, "plată de verificat anunțată");
  },
};
