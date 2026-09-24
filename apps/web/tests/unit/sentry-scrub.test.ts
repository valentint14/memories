import { describe, expect, it } from "vitest";
import { scrub, scrubString } from "../../lib/observability/scrub";

// research.md R14: niciun email, nume de invitat, token de eveniment sau cale de fișier în Sentry.
describe("scrub (beforeSend)", () => {
  it("elimină emailurile, tokenurile din URL-uri și căile de fișiere din texte", () => {
    const text = scrubString(
      "Eroare pentru ana.pop@example.ro la /e/AbCdEfGhIjKlMnOpQrStUv pe 3f2f6a1c-6f8e-4d3a-9b1d-2a7c5e8f9a10/abc/original.jpg",
    );
    expect(text).not.toContain("ana.pop@example.ro");
    expect(text).not.toContain("AbCdEfGhIjKlMnOpQrStUv");
    expect(text).not.toContain("original.jpg");
    expect(text).toContain("[email]");
    expect(text).toContain("/e/[token]");
  });

  it("redactează câmpurile sensibile oriunde în eveniment", () => {
    const event = {
      message: "upload eșuat",
      request: { url: "https://app.test/e/AbCdEfGhIjKlMnOpQrStUv", data: { displayName: "Maria 🌸", signedToken: "secret" } },
      extra: { organizer_email: "org@example.ro", nested: [{ guest_name: "Ion", original_filename: "IMG_0001.HEIC" }] },
      user: { email: "org@example.ro" },
    };
    const clean = JSON.stringify(scrub(event));
    for (const secret of ["Maria", "secret", "org@example.ro", "Ion", "IMG_0001", "AbCdEfGhIjKlMnOpQrStUv"]) {
      expect(clean, secret).not.toContain(secret);
    }
    expect(clean).toContain("upload eșuat");
  });
});
