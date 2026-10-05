/** Confirmarea plății către organizator (003: FR-010, FR-012; contracts/worker-jobs.md). */
import { APP_TIME_ZONE } from "@memories/shared";
import { emailDocument, emailStyle, escapeHtml } from "../html.ts";
import { ro } from "../messages/ro.ts";

const dateFormat = new Intl.DateTimeFormat("ro-RO", { timeZone: APP_TIME_ZONE, day: "numeric", month: "long", year: "numeric" });
const moneyFormat = new Intl.NumberFormat("ro-RO", { style: "currency", currency: "RON" });

function months(n: number): string {
  return n === 1 ? "1 lună" : n % 100 >= 1 && n % 100 <= 19 ? `${String(n)} luni` : `${String(n)} de luni`;
}

export function paymentConfirmationEmail(input: {
  purpose: "activation" | "retention_extension";
  eventName: string;
  amountMinor: number;
  paidAt: Date;
  retentionMonths: number;
  purgeAt: Date | null;
  eventUrl: string;
}): { subject: string; text: string; html: string } {
  const m = ro.paymentConfirmation;
  const amount = moneyFormat.format(input.amountMinor / 100);
  const paid = dateFormat.format(input.paidAt);
  const intro =
    input.purpose === "activation" ? m.introActivation(input.eventName, amount, paid) : m.introExtension(input.eventName, amount, paid);
  const paragraphs = [
    intro,
    ...(input.purgeAt === null ? [] : [m.retention(months(input.retentionMonths), dateFormat.format(input.purgeAt))]),
    ...(input.purpose === "activation" ? [m.guestsCanUpload] : []),
    m.receipt,
  ];
  const text = [ro.greeting, "", ...paragraphs.flatMap((p) => [p, ""]), `${m.open}: ${input.eventUrl}`].join("\n");
  const html = emailDocument(`<p style="${emailStyle.p}">${escapeHtml(ro.greeting)}</p>
${paragraphs.map((p) => `<p style="${emailStyle.p}">${escapeHtml(p)}</p>`).join("\n")}
<p style="${emailStyle.p}"><a href="${escapeHtml(input.eventUrl)}" style="${emailStyle.button}">${escapeHtml(m.open)}</a></p>`);
  return { subject: m.subject(input.eventName), text, html };
}
