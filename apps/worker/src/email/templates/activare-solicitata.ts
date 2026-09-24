/** Emailul către administratori la o cerere de activare (002/FR-018a). */
import { APP_TIME_ZONE } from "@memories/shared";
import { escapeHtml } from "../html.ts";
import { ro } from "../messages/ro.ts";

const dateTime = new Intl.DateTimeFormat("ro-RO", { timeZone: APP_TIME_ZONE, dateStyle: "long", timeStyle: "short" });
const date = new Intl.DateTimeFormat("ro-RO", { timeZone: APP_TIME_ZONE, dateStyle: "long" });

export function activationRequestEmail(input: {
  eventName: string;
  eventDate: string;
  organizerEmail: string;
  requestedAt: Date;
  adminUrl: string;
}): { subject: string; text: string; html: string } {
  const m = ro.activationRequest;
  const rows: [string, string][] = [
    [m.event, input.eventName],
    [m.date, date.format(new Date(`${input.eventDate}T12:00:00Z`))],
    [m.organizer, input.organizerEmail],
    [m.requestedAt, dateTime.format(input.requestedAt)],
  ];
  const text = [m.intro, "", ...rows.map(([k, v]) => `${k}: ${v}`), "", `${m.open}: ${input.adminUrl}`].join("\n");
  const html = `<!doctype html>
<html lang="ro"><body style="font-family: system-ui, sans-serif; line-height: 1.5; color: #1f2937">
<p>${escapeHtml(m.intro)}</p>
<ul>${rows.map(([k, v]) => `<li><strong>${escapeHtml(k)}:</strong> ${escapeHtml(v)}</li>`).join("")}</ul>
<p><a href="${escapeHtml(input.adminUrl)}">${escapeHtml(m.open)}</a></p>
</body></html>`;
  return { subject: m.subject(input.eventName), text, html };
}
