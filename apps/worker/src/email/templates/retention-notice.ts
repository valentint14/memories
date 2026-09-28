/**
 * Emailul de avertizare dinaintea ștergerii automate (FR-045): text + HTML în română, fără
 * imagini externe. Linkul duce la pagina evenimentului (cere autentificare, nu conține token).
 */
import { APP_TIME_ZONE } from "@memories/shared";
import { emailDocument, emailStyle, escapeHtml } from "../html.ts";

export type Threshold = "30d" | "7d" | "1d";

const WHEN: Record<Threshold, string> = {
  "30d": "peste 30 de zile",
  "7d": "peste 7 zile",
  "1d": "mâine",
};

const dateFormat = new Intl.DateTimeFormat("ro-RO", { timeZone: APP_TIME_ZONE, day: "numeric", month: "long", year: "numeric" });
const timeFormat = new Intl.DateTimeFormat("ro-RO", { timeZone: APP_TIME_ZONE, hour: "2-digit", minute: "2-digit" });

export function retentionNoticeEmail(input: {
  eventName: string;
  purgeAt: Date;
  threshold: Threshold;
  eventUrl: string;
}): { subject: string; text: string; html: string } {
  const date = dateFormat.format(input.purgeAt);
  const time = timeFormat.format(input.purgeAt);
  const when = WHEN[input.threshold];
  const subject = `Fișierele evenimentului „${input.eventName}” se șterg ${when} (${date})`;
  const lines = [
    "Bună ziua,",
    "",
    `Pozele și filmările de la „${input.eventName}” vor fi șterse automat și definitiv pe ${date}, la ora ${time} (${when}).`,
    "",
    "Înainte de această dată poți:",
    "• descărca toate fișierele într-o arhivă ZIP, din pagina evenimentului;",
    "• prelungi perioada de păstrare, dacă ai nevoie de mai mult timp.",
    "",
    `Pagina evenimentului: ${input.eventUrl}`,
    "",
    "După ștergere, fișierele nu mai pot fi recuperate.",
  ];
  const text = lines.join("\n");
  const html = emailDocument(`<p style="${emailStyle.p}">Bună ziua,</p>
<p style="${emailStyle.p}">Pozele și filmările de la <strong>„${escapeHtml(input.eventName)}”</strong> vor fi șterse automat și definitiv pe
<strong>${escapeHtml(date)}</strong>, la ora ${escapeHtml(time)} (${escapeHtml(when)}).</p>
<p style="${emailStyle.p}">Înainte de această dată poți:</p>
<ul style="${emailStyle.list}">
<li>descărca toate fișierele într-o arhivă ZIP, din pagina evenimentului;</li>
<li>prelungi perioada de păstrare, dacă ai nevoie de mai mult timp.</li>
</ul>
<p style="${emailStyle.p}"><a href="${escapeHtml(input.eventUrl)}" style="${emailStyle.button}">Deschide pagina evenimentului</a></p>
<p style="${emailStyle.muted}">După ștergere, fișierele nu mai pot fi recuperate.</p>`);
  return { subject, text, html };
}
