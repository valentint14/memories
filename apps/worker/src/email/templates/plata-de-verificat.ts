/** Plată de verificat de administrator: de rambursat sau contestată (003: FR-011, FR-016a). */
import { APP_TIME_ZONE } from "@memories/shared";
import { emailDocument, emailStyle, escapeHtml } from "../html.ts";
import { ro } from "../messages/ro.ts";

const dateTime = new Intl.DateTimeFormat("ro-RO", { timeZone: APP_TIME_ZONE, dateStyle: "long", timeStyle: "short" });
const moneyFormat = new Intl.NumberFormat("ro-RO", { style: "currency", currency: "RON" });

export type PaymentNoticeReason = keyof typeof ro.adminPaymentNotice.reasons;

export function adminPaymentNoticeEmail(input: {
  reason: PaymentNoticeReason;
  eventName: string;
  eventExists: boolean;
  organizerEmail: string;
  amountMinor: number;
  paidAt: Date | null;
  reference: string;
  adminUrl: string | null;
}): { subject: string; text: string; html: string } {
  const m = ro.adminPaymentNotice;
  const rows: [string, string][] = [
    [m.event, input.eventExists ? input.eventName : `${input.eventName} ${m.deleted}`],
    [m.organizer, input.organizerEmail],
    [m.amount, moneyFormat.format(input.amountMinor / 100)],
    ...(input.paidAt === null ? [] : ([[m.paidAt, dateTime.format(input.paidAt)]] as [string, string][])),
    [m.reference, input.reference],
  ];
  const action = input.reason === "DISPUTE" ? m.actionDispute : m.actionRefund;
  const text = [
    m.reasons[input.reason],
    "",
    ...rows.map(([k, v]) => `${k}: ${v}`),
    "",
    action,
    ...(input.adminUrl === null ? [] : ["", `${m.open}: ${input.adminUrl}`]),
  ].join("\n");
  const html = emailDocument(`<p style="${emailStyle.p}">${escapeHtml(m.reasons[input.reason])}</p>
<ul style="${emailStyle.list}">${rows.map(([k, v]) => `<li><strong>${escapeHtml(k)}:</strong> ${escapeHtml(v)}</li>`).join("")}</ul>
<p style="${emailStyle.p}">${escapeHtml(action)}</p>
${input.adminUrl === null ? "" : `<p style="${emailStyle.p}"><a href="${escapeHtml(input.adminUrl)}" style="${emailStyle.button}">${escapeHtml(m.open)}</a></p>`}`);
  return { subject: m.subject(input.eventName), text, html };
}
