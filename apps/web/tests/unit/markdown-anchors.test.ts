import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { headingId } from "../../lib/heading-id";
import { linkKind, markdownOutline } from "../../lib/markdown-outline";

describe("headingId", () => {
  it("scoate numărul, diacriticele și spațiile din titlu", () => {
    expect(headingId("5. Retragere și rambursări")).toBe("retragere-si-rambursari");
    expect(headingId("10. Legea aplicabilă și soluționarea litigiilor")).toBe("legea-aplicabila-si-solutionarea-litigiilor");
  });

  it("scoate și numărul subsecțiunii", () => {
    expect(headingId("6.4 Cum ceri o rambursare")).toBe("cum-ceri-o-rambursare");
    expect(headingId("6.4. Cum ceri o rambursare")).toBe("cum-ceri-o-rambursare");
  });
});

describe("markdownOutline", () => {
  it("listează secțiunile și subsecțiunile, în ordine", () => {
    const source = "# Titlu\n\ntext\n\n## 1. Prima\n\n### 1.1 Sub unu\n\n## 2. A doua";
    expect(markdownOutline(source)).toEqual([
      { id: "prima", text: "1. Prima", level: 2 },
      { id: "sub-unu", text: "1.1 Sub unu", level: 3 },
      { id: "a-doua", text: "2. A doua", level: 2 },
    ]);
  });
});

describe("linkKind", () => {
  it("acceptă https, mailto și căi din aplicație", () => {
    expect(linkKind("https://anpc.ro")).toBe("external");
    expect(linkKind("mailto:a@b.ro")).toBe("external");
    expect(linkKind("/privacy")).toBe("internal");
  });

  it("respinge schemele periculoase și URL-urile fără schemă", () => {
    for (const href of ["javascript:alert(1)", "data:text/html,x", "//evil.example", "http://x.ro", "anpc.ro"]) expect(linkKind(href), href).toBeNull();
  });
});

describe("termenii în vigoare", () => {
  const dir = join(import.meta.dirname, "../../content/legal/terms");
  const source = readFileSync(join(dir, "2026-10-19.md"), "utf8");

  it("ancorele sunt unice, iar „Retragere și rambursări” își păstrează ancora din subsol", () => {
    const ids = markdownOutline(source).map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("retragere-si-rambursari");
  });
});
