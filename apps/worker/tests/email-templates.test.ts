import { describe, expect, it } from "vitest";
import { confirmationEmail } from "../src/email/templates/confirmare.ts";
import { loginEmail } from "../src/email/templates/autentificare.ts";

// Conținutul emailurilor de confirmare și autentificare (002: FR-013; contracts/worker-jobs.md).
const link = "http://localhost:3000/auth/confirm?request=r1&token_hash=abc";

describe("confirmationEmail", () => {
  const mail = confirmationEmail({ eventName: "Nunta <b>Ana</b> & Mihai", code: "123456", link });

  it("are codul în subiect", () => {
    expect(mail.subject).toBe("Confirmă evenimentul tău Memories — cod 123456");
  });

  it("conține produsul, scopul, evenimentul, codul, linkul, valabilitatea și nota de ignorare", () => {
    for (const body of [mail.text, mail.html]) {
      expect(body).toContain("Memories");
      expect(body).toContain("123456");
      expect(body).toContain("15 minute");
      expect(body).toContain("o singură dată");
      expect(body).toContain("Dacă nu tu ai cerut acest email, îl poți ignora");
    }
    expect(mail.text).toContain("Nunta <b>Ana</b> & Mihai");
    expect(mail.text).toContain(link);
    expect(mail.html).toContain(`href="${link.replace("&", "&#38;")}"`);
  });

  it("escapează numele evenimentului în HTML", () => {
    expect(mail.html).not.toContain("<b>Ana</b>");
    expect(mail.html).toContain("Nunta &#60;b&#62;Ana&#60;/b&#62; &#38; Mihai");
  });
});

describe("loginEmail", () => {
  const mail = loginEmail({ code: "654321", link });

  it("are codul în subiect și nu menționează un eveniment", () => {
    expect(mail.subject).toBe("Codul tău de autentificare Memories: 654321");
    expect(mail.text).not.toContain("eveniment");
  });

  it("conține codul, linkul, valabilitatea și nota de ignorare", () => {
    for (const body of [mail.text, mail.html]) {
      expect(body).toContain("654321");
      expect(body).toContain("15 minute");
      expect(body).toContain("Dacă nu tu ai cerut acest email, îl poți ignora");
    }
    expect(mail.text).toContain(link);
  });
});
