import { describe, expect, it } from "vitest";
import { normalizeEmail } from "@memories/shared";
import { createSelfServiceSchema, isHoneypotFilled } from "../../lib/validation/self-service";

// Formularul de creare de pe pagina principală (002: FR-001, FR-002).
const NOW = new Date("2026-10-15T21:30:00Z"); // 16 octombrie, 00:30 în România
const schema = createSelfServiceSchema(NOW);

const valid = {
  email: " Ana@Exemplu.RO ",
  name: "  Nunta Ana și Mihai ",
  eventDate: "2026-10-16",
  termsVersion: "2026-10-01",
  privacyVersion: "2026-10-01",
  accepted: "on",
};

function fieldsOf(input: unknown): string[] {
  const result = schema.safeParse(input);
  return result.success ? [] : result.error.issues.map((i) => i.path.join("."));
}

describe("createSelfServiceSchema", () => {
  it("acceptă un formular valid, normalizează emailul și taie spațiile din nume", () => {
    expect(schema.parse(valid)).toEqual({
      email: "ana@exemplu.ro",
      name: "Nunta Ana și Mihai",
      eventDate: "2026-10-16",
      termsVersion: "2026-10-01",
      privacyVersion: "2026-10-01",
    });
  });

  it("refuză emailul invalid sau prea lung", () => {
    expect(fieldsOf({ ...valid, email: "nu-e-email" })).toEqual(["email"]);
    expect(fieldsOf({ ...valid, email: `${"a".repeat(250)}@x.ro` })).toEqual(["email"]);
  });

  it("cere un nume de 1–120 de caractere", () => {
    expect(fieldsOf({ ...valid, name: "   " })).toEqual(["name"]);
    expect(fieldsOf({ ...valid, name: "a".repeat(121) })).toEqual(["name"]);
    expect(fieldsOf({ ...valid, name: "a".repeat(120) })).toEqual([]);
  });

  it("acceptă data între azi (ora României) și peste 2 ani", () => {
    expect(fieldsOf({ ...valid, eventDate: "2026-10-15" })).toEqual(["eventDate"]);
    expect(fieldsOf({ ...valid, eventDate: "2026-10-16" })).toEqual([]);
    expect(fieldsOf({ ...valid, eventDate: "2028-10-16" })).toEqual([]);
    expect(fieldsOf({ ...valid, eventDate: "2028-10-17" })).toEqual(["eventDate"]);
    expect(fieldsOf({ ...valid, eventDate: "16.10.2026" })).toEqual(["eventDate"]);
  });

  it("cere acceptarea explicită a termenilor", () => {
    expect(fieldsOf({ ...valid, accepted: undefined })).toEqual(["accepted"]);
    expect(fieldsOf({ ...valid, accepted: "off" })).toEqual(["accepted"]);
  });
});

describe("isHoneypotFilled", () => {
  it("e fals doar pentru câmpul gol sau lipsă", () => {
    expect(isHoneypotFilled(null)).toBe(false);
    expect(isHoneypotFilled("")).toBe(false);
    expect(isHoneypotFilled("https://spam.example")).toBe(true);
  });
});

describe("normalizeEmail", () => {
  it("taie spațiile și folosește litere mici", () => {
    expect(normalizeEmail("  Ana@Exemplu.RO ")).toBe("ana@exemplu.ro");
  });
});
