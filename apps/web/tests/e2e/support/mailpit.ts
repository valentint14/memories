/** Citește emailurile trimise local de Supabase Auth și de worker (Mailpit, fără emailuri reale). */
const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://localhost:54324";

interface MailpitSummary {
  ID: string;
  Created: string;
  Subject: string;
}

interface MailpitMessage {
  ID: string;
  Subject: string;
  HTML: string;
  Text: string;
}

async function search(to: string): Promise<MailpitSummary[]> {
  const url = `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Mailpit ${res.status}`);
  const body = (await res.json()) as { messages: MailpitSummary[] };
  return body.messages;
}

/** Așteaptă un email nou pentru adresă, trimis după `since`, și îl întoarce complet. */
export async function waitForEmail(
  to: string,
  opts: { since: Date; subjectIncludes?: string; timeoutMs?: number } ,
): Promise<MailpitMessage> {
  const deadline = Date.now() + (opts.timeoutMs ?? 20_000);
  while (Date.now() < deadline) {
    const found = (await search(to)).find(
      (m) =>
        new Date(m.Created) >= opts.since &&
        (opts.subjectIncludes === undefined || m.Subject.includes(opts.subjectIncludes)),
    );
    if (found) {
      const res = await fetch(`${MAILPIT_URL}/api/v1/message/${found.ID}`);
      return (await res.json()) as MailpitMessage;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Niciun email pentru ${to} în timpul alocat`);
}

/** Extrage primul link din corpul HTML al emailului care conține `pathPart`. */
export function extractLink(message: MailpitMessage, pathPart: string): string {
  const match = [...message.HTML.matchAll(/href="([^"]+)"/g)]
    .map((m) => (m[1] ?? "").replaceAll("&amp;", "&"))
    .find((href) => href.includes(pathPart));
  if (match === undefined) throw new Error(`Link cu ${pathPart} negăsit în email`);
  return match;
}
