/** Emailul de confirmare a unui eveniment creat self-service (002: FR-006, FR-013). */
import { codeEmail } from "../html.ts";
import { ro } from "../messages/ro.ts";

export function confirmationEmail(input: { eventName: string; code: string; link: string }) {
  return codeEmail({
    subject: ro.confirmation.subject(input.code),
    greeting: ro.greeting,
    intro: ro.confirmation.intro(input.eventName),
    action: ro.confirmation.action,
    codeLabel: ro.codeLabel,
    code: input.code,
    link: input.link,
    button: ro.confirmation.button,
    validity: ro.validity,
    ignore: ro.ignore,
  });
}
