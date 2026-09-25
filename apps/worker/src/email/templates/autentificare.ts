/** Emailul de autentificare pentru organizatori și administratori (002: FR-010, FR-013). */
import { codeEmail } from "../html.ts";
import { ro } from "../messages/ro.ts";

export function loginEmail(input: { code: string; link: string }) {
  return codeEmail({
    subject: ro.login.subject(input.code),
    greeting: ro.greeting,
    intro: ro.login.intro,
    action: ro.login.action,
    codeLabel: ro.codeLabel,
    code: input.code,
    link: input.link,
    button: ro.login.button,
    validity: ro.validity,
    ignore: ro.ignore,
  });
}
