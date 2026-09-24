/** Escapare pentru textul introdus de utilizatori (ex. numele evenimentului) în emailurile HTML. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${String(c.charCodeAt(0))};`);
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
  const html = `<!doctype html>
<html lang="ro"><body style="font-family: system-ui, sans-serif; line-height: 1.5; color: #1f2937">
<p>${escapeHtml(parts.greeting)}</p>
<p>${escapeHtml(parts.intro)}</p>
<p>${escapeHtml(parts.action)}</p>
<p>${escapeHtml(parts.codeLabel)}:</p>
<p style="font-size: 28px; font-weight: 700; letter-spacing: 6px; font-family: ui-monospace, monospace">${escapeHtml(parts.code)}</p>
<p><a href="${escapeHtml(parts.link)}">${escapeHtml(parts.button)}</a></p>
<p>${escapeHtml(parts.validity)}</p>
<p>${escapeHtml(parts.ignore)}</p>
</body></html>`;
  return { subject: parts.subject, text, html };
}
