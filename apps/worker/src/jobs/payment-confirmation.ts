import { config } from "../config.ts";
import { query } from "../db.ts";
import { paymentConfirmationEmail } from "../email/templates/plata-confirmata.ts";
import { sendMail } from "../email/transport.ts";
import { log } from "../log.ts";
import type { JobHandler } from "./types.ts";

/** Emailul de confirmare a plății către organizator (003: FR-010; contracts/worker-jobs.md). */
export const paymentConfirmation: JobHandler<{ type: "payment_confirmation"; payment_id: string }> = {
  async run({ payment_id: paymentId }) {
    const [payment] = await query<{
      purpose: "activation" | "retention_extension";
      event_id: string | null;
      event_name: string | null;
      organizer_email: string | null;
      amount_minor: string;
      paid_at: Date;
      retention_months: number;
      purge_at: Date | null;
    }>(
      `select p.purpose::text, p.event_id, p.event_name, p.organizer_email::text, p.amount_minor, p.paid_at,
              p.retention_months, e.purge_at
         from public.payments p
         left join public.events e on e.id = p.event_id
        where p.id = $1 and p.status = 'paid'`,
      [paymentId],
    );
    // Plățile anonimizate (001/FR-047) nu mai au destinatar.
    if (!payment || payment.organizer_email === null) return;

    const mail = paymentConfirmationEmail({
      purpose: payment.purpose,
      eventName: payment.event_name ?? "",
      amountMinor: Number(payment.amount_minor),
      paidAt: payment.paid_at,
      retentionMonths: payment.retention_months,
      purgeAt: payment.purge_at,
      eventUrl: new URL(`/events/${payment.event_id ?? ""}`, config.appUrl).toString(),
    });
    await sendMail({ to: payment.organizer_email, ...mail });
    log.info({ job: "payment_confirmation", payment_id: paymentId, result: "sent" }, "confirmarea plății trimisă");
  },
};
