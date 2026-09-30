/** Avertizarea de 7 zile pentru un eveniment neactivat (002: FR-019). */
import { APP_TIME_ZONE } from "@memories/shared";
import { emailDocument, emailStyle, escapeHtml } from "../html.ts";
import { ro } from "../messages/ro.ts";

const dateFormat = new Intl.DateTimeFormat("ro-RO", { timeZone: APP_TIME_ZONE, day: "numeric", month: "long", year: "numeric" });
const moneyFormat = new Intl.NumberFormat("ro-RO", { style: "currency", currency: "RON" });

export function unactivatedNoticeEmail(input: {
  eventName: string;
  purgeAt: Date;
  priceMinor: number;
  eventUrl: string;
}): { subject: string; text: string; html: string } {
  const m = ro.unactivatedNotice;
  const date = dateFormat.format(input.purgeAt);
  const price = moneyFormat.format(input.priceMinor / 100);
  const lines = [ro.greeting, "", m.intro(input.eventName, date), "", m.howTo(price), "", `${m.open}: ${input.eventUrl}`, "", ro.ignore];
  const html = emailDocument(`<p style="${emailStyle.p}">${escapeHtml(ro.greeting)}</p>
<p style="${emailStyle.p}">${escapeHtml(m.intro(input.eventName, date))}</p>
<p style="${emailStyle.p}">${escapeHtml(m.howTo(price))}</p>
<p style="${emailStyle.p}"><a href="${escapeHtml(input.eventUrl)}" style="${emailStyle.button}">${escapeHtml(m.open)}</a></p>`);
  return { subject: m.subject(input.eventName, date), text: lines.join("\n"), html };
}
