/** Escapare pentru textul introdus de utilizatori (ex. numele evenimentului) în emailurile HTML. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${String(c.charCodeAt(0))};`);
}

/**
 * Culorile și fonturile limbajului vizual „Foaie de contact” (apps/web/app/globals.css). Emailurile
 * nu încarcă fonturi externe (research R10): Newsreader și Plex au fallback-uri sigure.
 */
const PAPER = "#f3eee4";
const PAPER_RAISED = "#fbf8f2";
const INK = "#1b1a17";
const INK_MUTED = "#5e584e";
const RULE = "#d6cebf";
const SERIF = "Newsreader, Georgia, 'Times New Roman', serif";
const SANS = "'IBM Plex Sans', -apple-system, 'Segoe UI', Helvetica, sans-serif";
const MONO = "'IBM Plex Mono', ui-monospace, Menlo, Consolas, monospace";

/** Stiluri inline pentru elementele din corpul emailului. */
export const emailStyle = {
  p: `margin: 0 0 16px`,
  link: `color: ${INK}; text-decoration: underline`,
  /** Acțiunea principală: singurul buton plin din email. */
  button: `display: inline-block; padding: 12px 20px; border-radius: 2px; background: ${INK}; color: ${PAPER_RAISED}; font-weight: 600; text-decoration: none`,
  muted: `margin: 0 0 16px; color: ${INK_MUTED}; font-size: 14px`,
  code: `margin: 0 0 16px; font-family: ${MONO}; font-size: 30px; font-weight: 500; letter-spacing: 8px; color: ${INK}`,
  /** Eticheta de deasupra codului: ca etichetele aplicației (`ui.kicker`), Plex Sans semibold, majuscule. */
  label: `margin: 0 0 4px; font-family: ${SANS}; font-size: 12px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: ${INK_MUTED}`,
  list: `margin: 0 0 16px; padding: 0 0 0 20px`,
} as const;

/**
 * Documentul comun: hârtie caldă, foaia pe mijloc cu linie subțire, numele produsului în serif.
 * Orice email se încheie cu un element cu marginea de jos de 16 px (`emailStyle`), iar clienții de
 * email nu știu `:last-child`: foaia are jos 12 px, ca spațiul de sub ultimul rând (16 + 12) să fie
 * egal cu cel de sus (28).
 */
export function emailDocument(inner: string): string {
  return `<!doctype html>
<html lang="ro"><body style="margin: 0; padding: 24px 12px; background: ${PAPER}; font-family: ${SANS}; font-size: 16px; line-height: 1.5; color: ${INK}">
<div style="max-width: 560px; margin: 0 auto; padding: 28px 24px 12px; background: ${PAPER_RAISED}; border: 1px solid ${RULE}; border-radius: 2px">
<p style="margin: 0 0 24px; padding-bottom: 12px; border-bottom: 1px solid ${INK}; font-family: ${SERIF}; font-size: 24px; color: ${INK}">Memories</p>
${inner}
</div>
</body></html>`;
}

/** Emailul cu cod și link: text simplu + HTML fără imagini externe (research R10). */
export function codeEmail(parts: {
  subject: string;
  greeting: string;
  intro: string;
  action: string;
  codeLabel: string;
  code: string;
  link: string;
  button: string;
  validity: string;
  ignore: string;
}): { subject: string; text: string; html: string } {
  const text = [parts.greeting, "", parts.intro, "", parts.action, "", `${parts.codeLabel}: ${parts.code}`, "", parts.link, "", parts.validity, parts.ignore].join("\n");
  const html = emailDocument(`<p style="${emailStyle.p}">${escapeHtml(parts.greeting)}</p>
<p style="${emailStyle.p}">${escapeHtml(parts.intro)}</p>
<p style="${emailStyle.p}">${escapeHtml(parts.action)}</p>
<p style="${emailStyle.label}">${escapeHtml(parts.codeLabel)}:</p>
<p style="${emailStyle.code}">${escapeHtml(parts.code)}</p>
<p style="${emailStyle.p}"><a href="${escapeHtml(parts.link)}" style="${emailStyle.button}">${escapeHtml(parts.button)}</a></p>
<p style="${emailStyle.muted}">${escapeHtml(parts.validity)}</p>
<p style="${emailStyle.muted}">${escapeHtml(parts.ignore)}</p>`);
  return { subject: parts.subject, text, html };
}
