/** Avertizarea de 7 zile pentru un eveniment neactivat (002: FR-019). */
import { APP_TIME_ZONE } from "@memories/shared";
import { escapeHtml } from "../html.ts";
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
  const html = `<!doctype html>
<html lang="ro"><body style="font-family: system-ui, sans-serif; line-height: 1.5; color: #1f2937">
<p>${escapeHtml(ro.greeting)}</p>
<p>${escapeHtml(m.intro(input.eventName, date))}</p>
<p>${escapeHtml(m.howTo(price))}</p>
<p><a href="${escapeHtml(input.eventUrl)}">${escapeHtml(m.open)}</a></p>
</body></html>`;
  return { subject: m.subject(input.eventName, date), text: lines.join("\n"), html };
}
